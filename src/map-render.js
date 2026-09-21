/* =========================================================
   MAP RENDER — pure D3 (https://d3js.org) + a small physics loop, no
   Lit/DOM-framework awareness. Same split as roles.js (pure logic) /
   ultimatum.js (Lit component): this file owns a container's DOM
   imperatively, src/home.js's <retro-home> owns everything else (HUD
   chrome, the agenda panel) declaratively via Lit and calls into this
   module from its firstUpdated()/updated() lifecycle hooks.

   ---------------------------------------------------------
   Why real <button> elements instead of bare SVG shapes for each
   location: every clickable location is an absolutely-positioned HTML
   <button> (no <svg> at all any more — there's nothing left to draw in
   one once the category zone blobs were removed), containing the
   game's name as real (if visually hidden until hover/selected) text.
   That gets keyboard/focus accessibility for free, and — the reason
   this was chosen originally — a stable hook for Playwright:
   `[data-game-id="..."]` plus the visible "Начать игру" button inside
   the agenda panel is what the test suite drives instead of relying
   on a click-to-open interaction.

   ---------------------------------------------------------
   Motion: each location drifts on its own slow, constant-velocity
   heading within a "safe" rectangle (the container minus the HUD
   panels' corners), softly bouncing off the edges, gently nudged apart
   from its neighbors, and gently pushed aside by a nearby cursor —
   driven by requestAnimationFrame — plus an independent CSS `rotate`
   on a child layer for a lazy in-plane 2D spin (a Y-axis "3D" turntable
   spin was tried and dropped — a flat PNG just squishes sideways, it
   never read as an actual object turning). A canvas behind the buttons
   draws two more purely decorative per-frame things: a short fading
   motion trail behind each drifting icon (colored via ICON_COLORS) and
   a handful of slow ambient background bubbles unrelated to the games.
   All of this — physics loop, canvas redraw, CSS spin — is skipped (or
   drawn once, statically, for the canvas) entirely when the browser
   prefers reduced motion: both the right accessibility call, and what
   keeps Playwright's actionability checks (which require an element's
   bounding box to stop moving) from timing out; see test/lib.js's
   openPage(). The cursor also drives a subtle parallax on the host's
   own background image (map-styles.css's :host background-position),
   set via --parallax-x/--parallax-y on the host element.

   ---------------------------------------------------------
   USAGE:
     const controller = createMap(containerEl, {
       onOpenGame: (id) => ...,   // navigate to the game (router.js)
       onSelect: (game|null) => ...,  // drive the Lit agenda panel
     });
     // 2nd arg: is a filter actually narrowing things down right now?
     // (drives the pulse ring on matches — see updateHighlight() below)
     controller.updateHighlight((game) => matchesCurrentFilters(game), filtersActive);
     controller.unfocus();               // fly back to the overview
     controller.startGame(id);           // dive-into-icon (+ portal flash), then onOpenGame
     controller.focusAndAutoStart(id, 3000); // "Случайная игра" flow
     controller.destroy();
========================================================= */
import * as d3 from 'd3';
import { ICONS } from './icon-assets.js';
import { hexToRgb } from './logic/color.js';
import {
  applyTransform,
  focusTransform as computeFocusTransform,
  computeIconScale,
  computeSafeBounds,
  hashString,
  IDENTITY,
  initialNodes,
  interpolateTransform,
  MIN_SEPARATION,
  moveNodes,
  mulberry32,
  separateNodes,
  smoothHeading,
  wakeDots,
} from './logic/map-physics.js';
import { isLite } from './perf.js';
import { GAMES } from './state.js';
import { showToast } from './toast.js';

// Mirrors the CSS custom properties in styles/map-styles.css
// (--map-cognitive etc.) — kept in sync by hand, noted in both places.
// Exported so home.js's agenda panel can color its category tag to
// match, without duplicating the palette a second time. NOT used for
// the hover glow any more — see ICON_COLORS below for why.
export const PALETTE = {
  cognitive: { color: '#7c5cfc' },
  econ: { color: '#ff9f1c' },
  social: { color: '#ff5d8f' },
};

// The hover glow used to reuse the category color above, which looked
// mismatched next to whatever color the icon's own artwork actually
// is (a category has 4-7 games in it, all sharing one hue regardless
// of their icon's real color). These are each icon's own alpha-
// weighted average color instead — computed once from src/icons/*.png
// with a small script (plain zlib+struct PNG decode, no dependency;
// see docs/modernization-plan.md for the exact approach), not
// hand-picked, so the glow always matches what's actually on screen.
// Exported so game-trail.js can give each game's in-game progress
// trail the exact same accent color as its map icon, without
// resampling the PNGs a second time.
export const ICON_COLORS = {
  'cube-1': '#2dc6f1',
  'cube-2': '#c84ef9',
  'cylinder-1': '#fe9999',
  'cylinder-2': '#86e63b',
  'flat-cylinder': '#f1d20f',
  helix: '#f48d4e',
  icosahedron: '#587aeb',
  pill: '#edbb00',
  'pyramid-1': '#feb8ff',
  'pyramid-2': '#b3eb45',
  sphere: '#b046f6',
  spheres: '#ff8458',
  'torus-1': '#f7a203',
  'torus-2': '#8976f7',
  'torus-knot': '#1bd29d',
};

const REDUCED_MOTION =
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const LOCATION_SIZE = 140; // mirrors .location's width/height in map-styles.css

export function createMap(container, { onOpenGame, onSelect }) {
  const overlay = d3.select(container).append('div').attr('class', 'loc-overlay');

  // Canvas for the two purely decorative per-frame effects (ambient
  // background bubbles, each icon's motion trail) — appended before
  // the location buttons so it paints behind them (see its CSS
  // comment). Sized in device pixels so it isn't itself the blurry
  // part after everything else just got de-pixelated.
  const canvas = overlay.append('canvas').attr('class', 'map-fx-canvas').node();
  const ctx = canvas.getContext('2d');
  function resizeCanvas() {
    const rect = container.getBoundingClientRect();
    // Capped: the canvas only holds soft translucent dots, so a 3x
    // backing store on a hi-dpi screen is pure fill-rate cost.
    const dpr = Math.min(window.devicePixelRatio || 1, isLite() ? 1 : 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    // The backing store is in device pixels, but the element's on-screen size
    // must stay the container's size in CSS pixels. Without this an absolutely
    // positioned <canvas> is laid out at its INTRINSIC size — i.e. `dpr` times
    // too big — so on a Retina screen every trail dot was drawn twice as far
    // from its icon as it should be (and, toward the bottom-right, off-screen).
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return rect;
  }
  let canvasRect = resizeCanvas();

  // The host element (outside this shadow-root subtree) — reached only
  // to set the cursor-parallax custom properties the background image
  // reads (map-styles.css's :host background-position). Nothing else
  // here touches the host.
  const hostEl = container.getRootNode().host;

  // The floating HUD cards (roster/filters/masthead/shuffle button, see
  // map-styles.css) sit at fixed screen corners on top of the map —
  // this is the rectangle everything else has to stay inside so a
  // location never drifts under one of them.
  function safeBounds() {
    const rect = container.getBoundingClientRect();
    return computeSafeBounds(rect.width, rect.height);
  }

  // On a small or zoomed-in window there isn't room for 13 full-size icons
  // (and their glow) inside the safe area — they'd spill off-screen or slide
  // under the HUD. So the icons themselves shrink to fit: `iconScale`
  // (0.4..1, exactly 1 on any normal screen) is published to the CSS as
  // --icon-scale and also scales how far apart the icons keep each other.
  let iconScale = 1;
  function syncLayout() {
    const b = safeBounds();
    const next = computeIconScale(b, GAMES.length);
    if (Math.abs(next - iconScale) > 0.005) {
      iconScale = next;
      hostEl?.style.setProperty('--icon-scale', iconScale.toFixed(3));
    }
    return b;
  }

  const bounds = syncLayout();
  const nodes = initialNodes(GAMES, bounds, { minSeparation: MIN_SEPARATION * iconScale });

  let currentTransform = IDENTITY;
  let focusedId = null;
  let startingId = null; // guards against a stray timer firing after navigation

  const buttons = overlay
    .selectAll('button.location')
    .data(nodes)
    .join('button')
    .attr('type', 'button')
    .attr('class', (d) => `location${d.ready ? '' : ' disabled'}`)
    .attr('data-game-id', (d) => d.id)
    .attr('data-match', 'true')
    .style('--loc-color', (d) => PALETTE[d.category].color)
    .style('--loc-icon-color', (d) => ICON_COLORS[d.icon] || PALETTE[d.category].color)
    .each(function (d) {
      const rand = mulberry32(hashString(`${d.id}:spin`));
      this.style.setProperty('--spin2d-dur', `${(16 + rand() * 14).toFixed(1)}s`);
      this.style.setProperty('--spin2d-dir', rand() < 0.5 ? '1' : '-1');
    })
    .html(
      (d) => `
        <span class="loc-spin2d">
          <span class="loc-badge"><img src="${ICONS[d.icon]}" alt="" /></span>
        </span>
        <span class="loc-name-tip">${d.name}</span>
      `,
    )
    .on('click', (_event, d) => selectGame(d))
    .on('focus', (_event, d) => selectGame(d));

  // --loc-color (category) feeds the agenda panel's category tag;
  // --loc-icon-color (this icon's own sampled color) feeds the hover
  // glow — see ICON_COLORS above for why these are deliberately two
  // different values now.
  function positionAll() {
    // Written as one inline `transform` rather than three inherited
    // custom properties: a custom property change invalidates style for
    // the button's whole subtree (spin wrapper, badge, img) every frame,
    // which is what hurt on weak machines; a plain transform only needs
    // compositing. Rounded to 0.1px — sub-pixel precision is invisible
    // and skipping unchanged values avoids dirtying style at all.
    const k = currentTransform.k;
    buttons.each(function (d) {
      const [x, y] = applyTransform(currentTransform, [d.x, d.y]);
      const value = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${k.toFixed(3)})`;
      if (this.__t !== value) {
        this.__t = value;
        this.style.transform = value;
      }
    });
  }
  positionAll(); // before the first RAF tick, so nothing flashes at (0,0)

  // --- One-time staggered entrance: icons fly in from below/center
  // instead of just being there on the first paint. Uses --tx/--ty
  // (already correct, set above) as the landing spot and layers a
  // temporary inline `translate`/`scale`/`opacity` on top, cleared once
  // each icon settles — after that this never touches those properties
  // again, so it can't interfere with the idle-bob/hover states that
  // use the same properties later.
  if (!REDUCED_MOTION) {
    buttons.each(function (d) {
      const rand = mulberry32(hashString(`${d.id}:enter`));
      const delay = 60 + rand() * 480;
      const fromX = (rand() - 0.5) * 60;
      const fromY = 90 + rand() * 60;
      this.style.opacity = '0';
      this.style.scale = '0.3';
      this.style.translate = `${fromX}px ${fromY}px`;
      setTimeout(() => {
        this.style.transition =
          'opacity 0.6s var(--map-ease), scale 0.6s var(--map-ease), translate 0.6s var(--map-ease)';
        this.style.opacity = '';
        this.style.scale = '';
        this.style.translate = '';
        setTimeout(() => {
          this.style.transition = '';
        }, 650);
      }, delay);
    });
  }

  // --- Physics: slow constant-velocity drift, bounce off the safe
  // rectangle's edges, softly nudged apart from close neighbors. Off
  // entirely under prefers-reduced-motion (see this file's header).
  let rafId = null;
  let lastT = null;

  // Pointer tracking, in WORLD space (inverted through the current
  // camera transform) so it stays correct through focus/dive zooms —
  // feeds both the mouse-repulsion physics below and the background
  // parallax. Listens on `container` itself (not `overlay`, which is
  // pointer-events:none precisely so it doesn't steal clicks meant for
  // location buttons or HUD cards — but that also makes it transparent
  // to hit-testing, so a plain mousemove naturally bubbles from
  // `container` wherever the cursor actually is over the map).
  let mouseWorld = null;
  const PARALLAX_MAX_PX = 14;
  container.addEventListener('pointermove', (event) => {
    const rect = container.getBoundingClientRect();
    const sx = event.clientX - rect.left;
    const sy = event.clientY - rect.top;
    mouseWorld = {
      x: (sx - currentTransform.x) / currentTransform.k,
      y: (sy - currentTransform.y) / currentTransform.k,
    };
    if (!REDUCED_MOTION) {
      const nx = rect.width ? (sx / rect.width - 0.5) * 2 : 0;
      const ny = rect.height ? (sy / rect.height - 0.5) * 2 : 0;
      hostEl.style.setProperty('--parallax-x', `${(nx * PARALLAX_MAX_PX).toFixed(1)}px`);
      hostEl.style.setProperty('--parallax-y', `${(ny * PARALLAX_MAX_PX).toFixed(1)}px`);
    }
  });
  container.addEventListener('pointerleave', () => {
    mouseWorld = null;
  });

  // Ambient background bubbles — a handful of faint, slow, looping
  // dots with no relation to the games at all, purely there so the
  // canvas (and therefore the map) doesn't look empty behind the
  // location icons. Independent of `nodes`/the safe-bounds rectangle —
  // these can drift anywhere across the full container.
  const PARTICLE_COUNT = 16;
  const particles = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const rand = mulberry32(hashString(`particle:${i}`));
    return {
      x: rand() * canvasRect.width,
      y: rand() * canvasRect.height,
      r: 1.5 + rand() * 3.5,
      vy: -(4 + rand() * 8),
      swayAmp: 8 + rand() * 14,
      swayFreq: 0.15 + rand() * 0.25,
      phase: rand() * Math.PI * 2,
      alpha: 0.05 + rand() * 0.09,
    };
  });

  function drawParticles(rect, dt, elapsed) {
    ctx.save();
    for (const p of particles) {
      p.y += p.vy * dt;
      if (p.y < -10) {
        p.y = rect.height + 10;
        p.x = Math.random() * rect.width;
      }
      const sway = Math.sin(elapsed * p.swayFreq + p.phase) * p.swayAmp;
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,255,255,${p.alpha})`;
      ctx.arc(p.x + sway, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // The wake: a fading comet tail of dots behind each freely-drifting icon, in
  // the icon's own sampled colour (ICON_COLORS). Laid out from the icon's
  // heading (logic/map-physics.js's wakeDots) rather than from its recent
  // positions — those are ~2px apart at the drift speeds we use, which put
  // the whole tail underneath the icon where it couldn't be seen. Frozen
  // (selected) icons don't get one: they're not moving.
  for (const n of nodes) {
    const speed = Math.hypot(n.vx, n.vy) || 1;
    n.heading = { x: n.vx / speed, y: n.vy / speed };
  }

  function drawTrails(transform) {
    // The camera zooming in on a selected icon (k up to 4.6) fades the wake
    // out — the other icons dim, and their tails shouldn't stay bright.
    const zoomFade = Math.max(0, 1 - (transform.k - 1) / 0.5);
    if (zoomFade <= 0) return;
    ctx.save();
    for (const n of nodes) {
      if (n.frozen) continue;
      const [r, g, b] = hexToRgb(ICON_COLORS[n.icon] || '#8a81a8');
      const [sx, sy] = applyTransform(transform, [n.x, n.y]);
      for (const dot of wakeDots(n.heading, iconScale)) {
        ctx.beginPath();
        ctx.fillStyle = `rgba(${r},${g},${b},${(dot.alpha * zoomFade).toFixed(3)})`;
        ctx.arc(
          sx + dot.dx * transform.k,
          sy + dot.dy * transform.k,
          dot.radius * transform.k,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }

  let elapsed = 0;
  function tick(t) {
    rafId = requestAnimationFrame(tick);
    if (lastT === null) {
      lastT = t;
      return;
    }
    // Lite mode (see perf.js): run the loop at ~30fps instead of the
    // display's rate — half the JS + style work, and the drift is slow
    // enough that nobody can tell.
    if (isLite() && t - lastT < 33) return;
    const dt = Math.min((t - lastT) / 1000, 0.1);
    lastT = t;
    elapsed += dt;
    const b = syncLayout();

    moveNodes(nodes, dt, b, mouseWorld);
    for (const n of nodes) n.heading = smoothHeading(n.heading, n.vx, n.vy, dt);
    separateNodes(nodes, dt, MIN_SEPARATION * iconScale);

    const rect = canvasRect;
    ctx.clearRect(0, 0, rect.width, rect.height);
    drawParticles(rect, dt, elapsed);
    if (!isLite()) drawTrails(currentTransform);
    positionAll();
  }
  if (!REDUCED_MOTION) {
    rafId = requestAnimationFrame(tick);
  } else {
    // Reduced motion: still paint the static particle dots once (no
    // trails — nothing moves to trail behind) rather than leaving the
    // canvas blank.
    ctx.clearRect(0, 0, canvasRect.width, canvasRect.height);
    drawParticles(canvasRect, 0, 0);
    positionAll();
  }

  // --- Camera ---
  // No manual pan/zoom any more — with icons drifting on their own and
  // a click flying the camera in, free dragging/scrolling would just
  // fight both. `currentTransform` only ever changes via the tweens
  // below (focus / unfocus / startGame's dive), each one manually
  // interpolated with d3.interpolate rather than routed through
  // d3-zoom's own gesture machinery, which isn't needed here.

  // Always the same on-screen spot a selected icon flies to — the
  // agenda panel (map-styles.css's .agenda-panel) is anchored at
  // left:40%/top:60% specifically so it lands just to the right of
  // this point, close together, clear of the top HUD corners — keep
  // these two in sync if either one moves (the point itself:
  // FOCUS_X_FRAC / FOCUS_Y_FRAC in logic/map-physics.js).
  function focusTransform() {
    const rect = container.getBoundingClientRect();
    return computeFocusTransform(
      nodes.find((n) => n.id === focusedId),
      rect.width,
      rect.height,
      currentTransform,
    );
  }

  function applyFocusClasses() {
    buttons
      .classed('selected', (d) => d.id === focusedId)
      .classed('unfocused', (d) => focusedId !== null && d.id !== focusedId);
  }

  function selectGame(d) {
    if (!d.ready) {
      showToast(`«${d.name}» скоро добавим`);
      return;
    }
    if (d.id === focusedId) return; // already focused — a click also fires 'focus' in some browsers
    focusedId = d.id;
    for (const n of nodes) n.frozen = n.id === focusedId;
    applyFocusClasses();
    onSelect?.(d);
    overlay
      .transition('camera')
      .duration(REDUCED_MOTION ? 0 : 650)
      .ease(d3.easeCubicOut)
      .tween('zoom', () => {
        const i = interpolateTransform(currentTransform, focusTransform());
        return (tt) => {
          currentTransform = i(tt);
          positionAll();
        };
      });
  }

  function unfocus() {
    focusedId = null;
    for (const n of nodes) n.frozen = false;
    applyFocusClasses();
    onSelect?.(null);
    overlay
      .transition('camera')
      .duration(REDUCED_MOTION ? 0 : 550)
      .ease(d3.easeCubicOut)
      .tween('zoom', () => {
        const i = interpolateTransform(currentTransform, IDENTITY);
        return (tt) => {
          currentTransform = i(tt);
          positionAll();
        };
      });
  }

  // Dives the camera in until the selected icon fills the screen, then
  // hands off to onOpenGame — the "Начать игру" button's action, and
  // also what "Случайная игра" chains into after its hold (see
  // focusAndAutoStart below).
  function startGame(id) {
    if (startingId) return; // already diving into something
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    startingId = id;
    onSelect?.(null); // the agenda panel would sit in the way of the dive
    const rect = container.getBoundingClientRect();
    const w = rect.width || 900;
    const h = rect.height || 600;
    const coverScale = (Math.max(w, h) / (LOCATION_SIZE * iconScale)) * 1.4;
    const target = {
      k: coverScale,
      x: w / 2 - coverScale * node.x,
      y: h / 2 - coverScale * node.y,
    };

    if (REDUCED_MOTION) {
      onOpenGame(id);
      return;
    }

    // "Portal" flash — a expanding ring in the icon's own color, right
    // where it currently sits on screen, timed to roughly match the
    // dive so it reads as diving THROUGH a burst of light rather than
    // just a plain zoom. A transient element, not part of the
    // continuously-updated buttons/canvas — removed once its own CSS
    // animation ends (map-styles.css's @keyframes portal-flash).
    const [fx, fy] = applyTransform(currentTransform, [node.x, node.y]);
    const flash = overlay
      .append('div')
      .attr('class', 'portal-flash')
      .style('left', `${fx}px`)
      .style('top', `${fy}px`)
      .style('--loc-icon-color', ICON_COLORS[node.icon] || '#fff')
      .node();
    flash.addEventListener('animationend', () => flash.remove(), { once: true });

    overlay
      .transition('camera')
      .duration(700)
      .ease(d3.easeCubicIn)
      .tween('zoom', () => {
        const i = interpolateTransform(currentTransform, target);
        return (tt) => {
          currentTransform = i(tt);
          positionAll();
        };
      })
      .on('end', () => onOpenGame(id));
  }

  // "Случайная игра": fly to it exactly like a click would (same
  // selectGame path, so the agenda panel shows too), hold, then dive
  // in — the standard start-game transition, just auto-triggered.
  function focusAndAutoStart(id, holdMs) {
    const d = nodes.find((n) => n.id === id);
    if (!d) return;
    selectGame(d);
    setTimeout(() => {
      if (focusedId === id) startGame(id);
    }, holdMs);
  }

  // `filtersActive` — true whenever a filter is actually narrowing
  // things down (not just "category=all, format=all", when literally
  // every location matches and pulsing all 13 rings at once would be
  // noise instead of a "look here" cue). Only affects whether matching
  // locations get the `.filter-match` pulse — the dim/grayscale on
  // non-matches (`data-match`) already worked, and is unaffected here.
  function updateHighlight(matchFn, filtersActive) {
    let anyMatch = false;
    buttons.each(function (d) {
      const match = matchFn(d);
      if (match) anyMatch = true;
      d3.select(this)
        .attr('data-match', match ? 'true' : 'false')
        .classed('filter-match', !!filtersActive && match);
    });
    overlay.select('.empty-note').remove();
    if (!anyMatch) {
      overlay
        .append('div')
        .attr('class', 'empty-note')
        .text('Нет игр с такими фильтрами — попробуйте сбросить один из них.');
    }
  }

  // Window resized / browser zoom changed: re-fit the icons right away and pull
  // any that ended up outside the new safe area back in. The tick loop does
  // this every frame too, but it doesn't run under prefers-reduced-motion.
  const resizeObserver = new ResizeObserver(() => {
    canvasRect = resizeCanvas(); // (resizing a canvas also clears it)
    for (const p of particles) p.x = Math.min(p.x, canvasRect.width);
    moveNodes(nodes, 0, syncLayout(), null);
    positionAll();
    if (REDUCED_MOTION) drawParticles(canvasRect, 0, 0); // no tick loop to repaint it
  });
  resizeObserver.observe(container);

  function destroy() {
    resizeObserver.disconnect();
    if (rafId) cancelAnimationFrame(rafId);
    overlay.remove();
  }

  return { updateHighlight, unfocus, startGame, focusAndAutoStart, destroy };
}
