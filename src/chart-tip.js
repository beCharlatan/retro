/* =========================================================
   SHARED PATTERN: hover tooltip for chart data points
   =========================================================
   A single tooltip element, reused across whichever game's chart
   is currently on screen, that follows the cursor and shows
   per-person detail on hover — who this dot is, and what they
   answered. Anchoring already labels every dot with a name, but
   crowd-wisdom's and dictator's charts don't (too many overlapping
   dots for permanent labels to stay legible), so hover is the only
   way to know whose point is whose there.

   ---------------------------------------------------------
   USAGE (inside a game's chart-drawing function, right after
   creating each SVG circle):

     const c = ns('circle', {cx:x, cy:y, r:6, fill:'#3E6E64', ...});
     svg.appendChild(c);
     ChartTip.attachToPoint(svg, ns, x, y, () => `<b>${d.name}</b>Оценка: ${d.guess} т`);

   attachToPoint() adds its own larger INVISIBLE circle on top of the
   visible dot and wires the hover there — a 5-6px filled circle is a
   fiddly target to hover precisely, so the actual hit area is bigger
   than what's drawn. Use plain attach() instead when the hover target
   is already a reasonably-sized element on its own.

   The callback runs on every hover (not just once at draw time), so
   it's safe to build the string from data that might be referenced
   by closure — no need to worry about stale values.
========================================================= */
const ChartTip = (() => {
  let el = null;

  function ensure() {
    if (el) return el;
    el = document.createElement('div');
    el.className = 'chart-tooltip';
    document.body.appendChild(el);
    return el;
  }

  function position(clientX, clientY) {
    const tip = ensure();
    tip.style.left = clientX + 'px';
    tip.style.top = clientY + 'px';
  }

  function hide() {
    if (el) el.classList.remove('visible');
  }

  // Attaches hover behaviour to `target` (an SVG or DOM element).
  // `content` is either a plain HTML string or a function returning
  // one, evaluated fresh on every mouseenter.
  function attach(target, content) {
    target.style.cursor = 'default';
    target.addEventListener('mouseenter', (e) => {
      const tip = ensure();
      tip.innerHTML = typeof content === 'function' ? content() : content;
      position(e.clientX, e.clientY);
      tip.classList.add('visible');
    });
    target.addEventListener('mousemove', (e) => {
      position(e.clientX, e.clientY);
    });
    target.addEventListener('mouseleave', hide);
  }

  // Convenience for chart dots specifically: a visible 5-6px circle
  // is a fiddly target to hover precisely, so this adds an invisible,
  // larger circle at the same position and wires the tooltip to THAT
  // instead — same visual dot, a much more forgiving hover area.
  // `ns` is the caller's own SVG-element factory (each chart already
  // has one); `content` works exactly like attach()'s.
  function attachToPoint(svg, ns, cx, cy, content, hitRadius) {
    const hit = ns('circle', {
      cx: cx,
      cy: cy,
      r: hitRadius || 12,
      fill: 'transparent',
      'pointer-events': 'all',
    });
    svg.appendChild(hit);
    attach(hit, content);
    return hit;
  }

  return { attach, attachToPoint, hide };
})();
