/* =========================================================
   SHARED PATTERN: protect in-progress answers from being
   lost to an accidental reload / closed tab / back button.
   =========================================================
   Auto-saves each game's working data to sessionStorage
   (cleared automatically when the tab closes — this is not
   a permanent record, just insurance against an accidental
   refresh mid-session) every time an answer changes, and lets a Lit
   component (docs/modernization-plan.md Phase 2+) offer to restore it
   the next time that same game screen is opened again in the same
   tab.

   ---------------------------------------------------------
   USAGE (inside a Lit component):

     constructor() {
       ...
       const loaded = Persist.load('anchoring');
       this.draft = loaded && Array.isArray(loaded.payload.data)
         && loaded.payload.data.length === this.names.length
         ? loaded
         : null;
     }

     // Whenever working data changes, persist a snapshot — the
     // payload is your own shape, Persist just wraps it with a
     // timestamp:
     _onEntryInput(e, idx) {
       ...
       Persist.save('anchoring', { data: this.data });
     }

     // Draft banner + timeAgo(draft.savedAt) rendered declaratively in
     // render() from `this.draft` — see src/games/dictator.js's
     // header comment for why (a Persist-owned imperative DOM-writing
     // helper used to exist for this, `Persist.banner()`/
     // `Persist.offerRestore()`, removed once every game had migrated
     // to the declarative form and nothing called them any more).
     // Restore/discard handlers just reassign local state and clear
     // `this.draft`:
     _restoreDraft() {
       this.data = this.draft.payload.data;
       this.draft = null;
       this.goTo(1);
     }
     _discardDraft() {
       Persist.clear('anchoring');
       this.draft = null;
     }

     // Once the round is "locked in" (results screen reached) or the
     // person leaves back to the menu, the draft is no longer needed:
     Persist.clear('anchoring');
========================================================= */
export function timeAgo(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'только что';
  if (mins === 1) return 'минуту назад';
  if (mins < 5) return mins + ' минуты назад';
  if (mins < 60) return mins + ' минут назад';
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? 'час назад' : hrs + ' ч. назад';
}

export const Persist = (() => {
  const PREFIX = 'retro-draft-';

  function save(gameId, payload) {
    try {
      sessionStorage.setItem(
        PREFIX + gameId,
        JSON.stringify({ payload: payload, savedAt: Date.now() }),
      );
    } catch {
      /* storage unavailable — fail silently, feature is best-effort */
    }
  }

  function load(gameId) {
    try {
      const raw = sessionStorage.getItem(PREFIX + gameId);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.payload ? parsed : null;
    } catch {
      return null;
    }
  }

  function clear(gameId) {
    try {
      sessionStorage.removeItem(PREFIX + gameId);
    } catch {
      /* noop */
    }
  }

  function hasAny() {
    try {
      for (let i = 0; i < sessionStorage.length; i++) {
        if (sessionStorage.key(i).indexOf(PREFIX) === 0) return true;
      }
    } catch {
      /* noop */
    }
    return false;
  }

  return { save, load, clear, hasAny };
})();

// Warn before leaving the tab only if some game has unsaved progress.
window.addEventListener('beforeunload', (e) => {
  if (Persist.hasAny()) {
    e.preventDefault();
    e.returnValue = '';
  }
});
