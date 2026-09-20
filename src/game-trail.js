/* =========================================================
   GAME TRAIL — shared progress path for every game screen
   (docs/modernization-plan.md: деталка as a continuation of the
   gamified map, branch `gme`). Replaces each game's old flat
   `.progress` dot-row with a small wavy path — d3.scalePoint
   spaces the step anchors evenly, d3.line/curveCatmullRom threads
   a smooth curve through them — carrying the game's own map icon
   as a "traveler" riding at the current step. Steps already
   passed glow solid in the game's own sampled color (map-render.js's
   ICON_COLORS — re-imported, not recomputed, so there's exactly
   one source of truth for "this game's color"); the step ahead
   stays a dim outline.

   Pure Lit template function, NOT an imperative D3-owned widget
   like map-render.js's createMap(): `screenIdx` is already a Lit
   reactive property that re-renders the whole game component on
   every step change, so the trail can just be plain declarative
   markup recomputed each time — no separate mount/update/destroy
   lifecycle to wire into all 13 games. The "glide to the next
   node" motion needs no JS animation loop either — Lit keeps the
   same `.trail-traveler` element across re-renders (it's a fixed
   position in the template, not conditionally created or keyed),
   so a plain CSS `transition` on its `transform` animates the
   position change for free, and honors prefers-reduced-motion for
   free too via styles.css's existing blanket
   `transition-duration: 0.01ms` rule under that media query — no
   REDUCED_MOTION check needed here the way map-render.js needs one
   for its JS-driven physics.

   The idle bob/rotate on the traveler icon is a SEPARATE inner
   <g>, not applied to the same element as the position transform —
   same reason map-render.js keeps camera-position and hover-scale
   on different properties/elements: a CSS `animation` on `transform`
   would otherwise fight the position `transition` on that same
   property every frame.

   USAGE (inside a game's render(), rendered into the sticky
   `.game-rail` sidebar next to the continuously-scrolling column of
   rounds — see game-shell.js):
     ${renderTrail({ current: this.activeRound, total: TOTAL_SCREENS, gameId: 'framing', stepLabels: ROUND_TITLES })}

   A tall left-right zigzag — bigger traveler/nodes, and NOT
   `preserveAspectRatio="none"` (the rail's own intrinsic size — width
   fixed by its column, height grown per step count — is exactly what
   should render, unstretched).

   Also exports gameAccentStyle(gameId) — the same per-game color,
   as an inline `--game-accent`/`--game-accent-deep` style string for
   the game's own `.wrap-wide` element, so styles.css's button.primary,
   focus rings, "Перемешать", the results-screen stat number etc. (see
   styles.css's `--game-accent` comment near :root) pick up the same
   accent as the trail without a second color source:
     <div class="wrap-wide" style=${gameAccentStyle('framing')}>

   Any sub-template built from `.map()` or a ternary and interpolated
   *inside* the outer `<svg>` MUST be tagged with Lit's `svg` (not
   `html`) — a nested `html` result is parsed as its own isolated
   fragment with no ambient <svg> context, so elements like <circle>/
   <image> silently land in the HTML namespace instead of SVG's and
   never paint. Only markup written directly in the outer template
   literal (not through a nested tagged template) is safe under plain
   `html`.

   Optional `stepLabels: string[]` (one per step) names each node for
   the hover tooltip. The tooltip itself is plain HTML (.trail-hotspot/
   .trail-hotspot-tip), not SVG — a native SVG <title> works but is a
   browser-chrome tooltip (slow to appear, unstyled, inconsistent
   across browsers) where a styled one that matches #toast's look is
   worth the extra markup. It's positioned by converting each node's
   viewBox (x, y) to a percentage of the <svg>'s own box and overlaying
   a same-percentage HTML dot on top — exact as long as the <svg> isn't
   letterboxed (true here: the rail sizes to the viewBox's own aspect
   ratio via preserveAspectRatio="xMidYMin meet"). Done steps also get a
   small checkmark drawn over the node (checkMarkPath()) so a finished
   round reads as an actual cleared checkpoint rather than "a dot in a
   slightly different shade".
========================================================= */
import * as d3 from 'd3';
import { html, svg } from 'lit';
import { ICONS } from './icon-assets.js';
import { darken } from './logic/color.js';
import { checkMarkPath, stepAnchors } from './logic/trail-geometry.js';
import { ICON_COLORS } from './map-render.js';
import { GAMES } from './state.js';

// The vertical rail's own intrinsic size — width is fixed by its
// column (see .game-rail in styles.css). Height is capped to
// MAX_TRAIL_HEIGHT and the gap between steps computed from it (not
// a fixed gap per step, which is what made a 6-7 round game's trail
// taller than a typical viewport and unable to fit "on one screen" —
// this reflows automatically for however many rounds a game turns
// out to have without needing a per-game tune).
const VB_W = 260;
const MAX_TRAIL_HEIGHT = 620;
const TRAVELER_SIZE = 84;
const NODE_R = { current: 12, done: 10, other: 7 };

const pathLine = d3.line().curve(d3.curveCatmullRom.alpha(0.6));

// gameId -> { icon, color } — the one place both renderTrail() and
// gameAccentStyle() look up a game's own map icon/color, so there's
// no risk of the two ever disagreeing.
function gameVisuals(gameId) {
  const game = GAMES.find((g) => g.id === gameId);
  const icon = game?.icon;
  return { icon, color: (icon && ICON_COLORS[icon]) || null };
}

export function gameAccentStyle(gameId) {
  const { color } = gameVisuals(gameId);
  return color ? `--game-accent:${color};--game-accent-deep:${darken(color)}` : '';
}

export function renderTrail({ current, total, gameId, stepLabels }) {
  const { icon, color: sampledColor } = gameVisuals(gameId);
  const color = sampledColor || 'var(--blue)';
  const clamped = Math.min(Math.max(current, 0), total - 1);
  const anchors = stepAnchors(total);
  const [tx, ty] = anchors[clamped];
  const pathD = pathLine(anchors);
  const traveledD = clamped > 0 ? pathLine(anchors.slice(0, clamped + 1)) : null;
  const nodeR = NODE_R;
  const travelerSize = TRAVELER_SIZE;

  return html`
    <div class="game-trail vertical" style="--trail-color:${color}">
      <div class="trail-svg-wrap">
        <svg viewBox="0 0 ${VB_W} ${MAX_TRAIL_HEIGHT}" preserveAspectRatio="xMidYMin meet" aria-hidden="true">
          <path class="trail-path" d=${pathD}></path>
          ${traveledD ? svg`<path class="trail-path-done" d=${traveledD}></path>` : ''}
          ${anchors.map(([x, y], i) => {
            const stepState = i < clamped ? 'done' : i === clamped ? 'current' : 'future';
            const r =
              stepState === 'current'
                ? nodeR.current
                : stepState === 'done'
                  ? nodeR.done
                  : nodeR.other;
            return svg`<g class="trail-node-group">
              <circle class="trail-node ${stepState}" cx=${x} cy=${y} r=${r}></circle>
              ${stepState === 'done' ? svg`<path class="trail-node-check" d=${checkMarkPath(x, y, r)}></path>` : ''}
            </g>`;
          })}
          <circle class="trail-node-halo" cx=${tx} cy=${ty} r=${nodeR.current}></circle>
          <g class="trail-traveler" style="transform: translate(${tx}px, ${ty}px)">
            <g class="trail-traveler-bob">
              ${
                icon
                  ? svg`<image
                    class="trail-traveler-img"
                    href=${ICONS[icon]}
                    x=${-travelerSize / 2}
                    y=${-travelerSize / 2}
                    width=${travelerSize}
                    height=${travelerSize}
                  ></image>`
                  : ''
              }
            </g>
          </g>
        </svg>
        <div class="trail-hotspots">
          ${anchors.map(([x, y], i) => {
            const stepState = i < clamped ? 'done' : i === clamped ? 'current' : 'future';
            const label = stepLabels?.[i] ?? `Шаг ${i + 1}`;
            const hitSize =
              stepState === 'current'
                ? travelerSize
                : Math.max(26, (stepState === 'done' ? nodeR.done : nodeR.other) * 3.2);
            return html`
              <span
                class="trail-hotspot"
                tabindex="0"
                style="left:${((x / VB_W) * 100).toFixed(2)}%; top:${((y / MAX_TRAIL_HEIGHT) * 100).toFixed(2)}%; width:${hitSize}px; height:${hitSize}px;"
              >
                <span class="trail-hotspot-tip">${label}</span>
              </span>
            `;
          })}
        </div>
      </div>
      <span class="trail-step-label">Шаг ${clamped + 1} из ${total}</span>
    </div>
  `;
}
