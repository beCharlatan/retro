/* =========================================================
   PRIVACY: briefly reveal a toggle-button choice right after it's
   clicked, then blur it again (see the .toggle-pair button.on.just-set
   CSS rule). One delegated listener covers every game that uses
   .toggle-pair — false-consensus, availability, framing,
   prisoners-dilemma — without each of them needing their own timer.

   Side-effect-only module — import it once (from main.js) for the
   listener; it has nothing to export.

   Uses e.composedPath()[0], not e.target: for a click that
   originates inside a Shadow DOM game component (docs/modernization-
   plan.md Phase 3+), a listener on `document` sees `e.target`
   RETARGETED to the shadow host (the custom element itself, not the
   button that was actually clicked) — standard behavior for composed
   events crossing a shadow boundary, regardless of open/closed mode.
   `.closest()` on that host element would never find `.toggle-pair
   button` inside its shadow root. composedPath()[0] is always the
   real originating element, shadow DOM or not, so this one change
   keeps working for both legacy (light DOM) games and Shadow DOM
   ones without needing two code paths.
========================================================= */
document.addEventListener('click', (e) => {
  const btn = e.composedPath()[0].closest?.('.toggle-pair button');
  if (!btn) return;
  btn.classList.add('just-set');
  clearTimeout(btn._peekTimer);
  btn._peekTimer = setTimeout(() => {
    btn.classList.remove('just-set');
  }, 1400);
});
