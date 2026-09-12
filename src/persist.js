/* =========================================================
   SHARED PATTERN: protect in-progress answers from being
   lost to an accidental reload / closed tab / back button.
   =========================================================
   Auto-saves each game's working data to sessionStorage
   (cleared automatically when the tab closes — this is not
   a permanent record, just insurance against an accidental
   refresh mid-session) every time an answer changes, and
   offers to restore it the next time that same game screen
   is opened again in the same tab.

   ---------------------------------------------------------
   USAGE (inside a game's render function):

     // Whenever working data changes (inside updateFillProgress
     // or equivalent), persist a snapshot. The payload is your
     // own shape — Persist just wraps it with a timestamp:
     Persist.save('anchoring', { data: data });

     // At the top of the instructions screen, offer to restore a
     // usable draft in one call: `validate` checks the raw payload
     // you saved, `onRestore` gets that same payload and reassigns
     // the game's local state + rebuilds the screen + navigates:
     Persist.offerRestore('anchoring', 'draft-mount-anchoring',
       (p) => Array.isArray(p.data) && p.data.length === NAMES.length,
       (p) => {
         data = p.data;
         buildEntryRows();
         updateFillProgress();
         anchoringGoTo(1);
       });

     // Once the round is "locked in" (results screen reached)
     // or the person leaves back to the menu, the draft is no
     // longer needed:
     Persist.clear('anchoring');
========================================================= */
const Persist = (function () {
  const PREFIX = 'retro-draft-';

  function save(gameId, payload) {
    try {
      sessionStorage.setItem(PREFIX + gameId, JSON.stringify({ payload: payload, savedAt: Date.now() }));
    } catch (e) { /* storage unavailable — fail silently, feature is best-effort */ }
  }

  function load(gameId) {
    try {
      const raw = sessionStorage.getItem(PREFIX + gameId);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.payload ? parsed : null;
    } catch (e) { return null; }
  }

  function clear(gameId) {
    try { sessionStorage.removeItem(PREFIX + gameId); } catch (e) { /* noop */ }
  }

  function hasAny() {
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        if (sessionStorage.key(i).indexOf(PREFIX) === 0) return true;
      }
    } catch (e) { /* noop */ }
    return false;
  }

  function timeAgo(ts) {
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'только что';
    if (mins === 1) return 'минуту назад';
    if (mins < 5) return mins + ' минуты назад';
    if (mins < 60) return mins + ' минут назад';
    const hrs = Math.round(mins / 60);
    return hrs === 1 ? 'час назад' : hrs + ' ч. назад';
  }

  // Renders a dismissible recovery banner into #mountId and wires its
  // two buttons; whichever is pressed clears the banner from the DOM.
  function banner(mountId, savedAt, onRestore, onDiscard) {
    const el = document.getElementById(mountId);
    if (!el) return;
    el.innerHTML =
      '<div class="draft-banner">' +
      '<span class="draft-text">📋 Есть незавершённая попытка (' + timeAgo(savedAt) + ') — продолжить с того места?</span>' +
      '<span class="draft-actions">' +
      '<button type="button" class="draft-restore">Восстановить</button>' +
      '<button type="button" class="draft-discard">Начать заново</button>' +
      '</span></div>';
    el.querySelector('.draft-restore').addEventListener('click', function () {
      el.innerHTML = '';
      onRestore();
    });
    el.querySelector('.draft-discard').addEventListener('click', function () {
      el.innerHTML = '';
      onDiscard();
    });
  }

  // One-call replacement for the "load draft, check it's still usable,
  // wire the banner" trio every game used to repeat by hand. `validate`
  // gets the raw payload you saved and returns true/false (drafts differ
  // in shape — some hold {data}, others {entries} or {assignment,
  // entries} / {groups, entries} — so this stays shape-agnostic rather
  // than guessing a common one). `onRestore` gets that same payload and
  // is responsible for reassigning the game's local state and
  // navigating to the right screen; discard just clears the draft.
  function offerRestore(gameId, mountId, validate, onRestore) {
    const draft = load(gameId);
    if (draft && validate(draft.payload)) {
      banner(mountId, draft.savedAt, () => onRestore(draft.payload), () => clear(gameId));
    }
  }

  return { save: save, load: load, clear: clear, hasAny: hasAny, banner: banner, offerRestore: offerRestore };
})();

// Warn before leaving the tab only if some game has unsaved progress.
window.addEventListener('beforeunload', function (e) {
  if (Persist.hasAny()) {
    e.preventDefault();
    e.returnValue = '';
  }
});
