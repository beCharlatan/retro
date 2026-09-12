/* =========================================================
   PRIVACY: briefly reveal a toggle-button choice right after it's
   clicked, then blur it again (see the .toggle-pair button.on.just-set
   CSS rule). One delegated listener covers every game that uses
   .toggle-pair — false-consensus, availability, framing,
   prisoners-dilemma — without each of them needing their own timer.

   Side-effect-only module — import it once (from main.js) for the
   listener; it has nothing to export.
========================================================= */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.toggle-pair button');
  if (!btn) return;
  btn.classList.add('just-set');
  clearTimeout(btn._peekTimer);
  btn._peekTimer = setTimeout(() => {
    btn.classList.remove('just-set');
  }, 1400);
});
