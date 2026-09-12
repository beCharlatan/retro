/* =========================================================
   SHARED PATTERN: screen navigation
   =========================================================
   Every game is a sequence of `.screen` sections inside its own
   `.wrap`, stepped through via a small set of `.dot` progress
   indicators. All 13 games had their own byte-identical copy of
   this logic — this is the one copy, and the one place to fix a
   navigation bug if it's ever found.

   ---------------------------------------------------------
   USAGE (inside a game's render function):

     window.anchoringGoTo = function(screenIdx){
       Screen.goTo(screenIdx);
     };

   If a game needs to do something extra on every navigation (rare —
   only framing.js currently does), just add it after the call:

     window.frGoTo = function(screenIdx){
       Screen.goTo(screenIdx);
       if(screenIdx !== 3) updateFillProgress();
     };

   For the "← Все игры" back-link, every game does the same two
   things: clear its own in-progress draft (leaving is a deliberate
   exit, not an accident worth recovering from) and render the home
   screen. One call replaces the whole listener:

     Screen.wireBackHome('anchoring');

   And every entry screen ends its updateFillProgress() the same way
   too — update the "Заполнено: N из M" counter, the progress bar,
   and the continue button's disabled state:

     function updateFillProgress(){
       const filled = data.filter(d => d.guess !== null).length;
       Screen.updateProgress('', filled, NAMES.length, 'show-results-btn', 2);
       if (hydrated) { Persist.save('crowd-wisdom', { data: data }); }
     }
========================================================= */
const Screen = (() => {
  function goTo(screenIdx) {
    Array.from(document.querySelectorAll('.screen')).forEach((s, i) => {
      s.classList.toggle('active', i === screenIdx);
    });
    Array.from(document.querySelectorAll('.dot')).forEach((d, i) => {
      d.classList.toggle('active', i === screenIdx);
      d.classList.toggle('done', i < screenIdx);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function wireBackHome(gameId) {
    const btn = document.getElementById('back-home');
    if (!btn) return;
    btn.addEventListener('click', () => {
      Persist.clear(gameId);
      renderHome();
    });
  }

  // Updates the standard "Заполнено: N из M" counter, its progress
  // bar, and the disabled state of the screen's continue button —
  // the same three DOM writes every entry screen in every game ends
  // its updateFillProgress() with. `idSuffix` is '' for games with a
  // single entry screen, or '-1'/'-2'/'-qIdx' for games with several
  // (rounds, questions) — matches the `fill-count<suffix>` /
  // `fill-bar<suffix>` id convention. `btnId` is the full id of the
  // button to enable/disable once `filled` reaches `minRequired`.
  function updateProgress(idSuffix, filled, total, btnId, minRequired) {
    document.getElementById('fill-count' + idSuffix).textContent = filled;
    document.getElementById('fill-bar' + idSuffix).style.width =
      (total ? (filled / total) * 100 : 0) + '%';
    document.getElementById(btnId).disabled = filled < minRequired;
  }

  return { goTo, wireBackHome, updateProgress };
})();
