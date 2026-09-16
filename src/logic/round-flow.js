/* =========================================================
   ROUND FLOW — pure state for the one-continuous-scroll layout
   =========================================================
   No DOM, no timers, no Lit: just the three numbers every game tracks
   and the rules for moving them, so the rules can be unit-tested
   (test/unit/round-flow.test.js) and RoundFlowController stays a thin
   adapter between these functions and the browser.

     screenIdx        how far the player has actually COMPLETED — the
                      furthest round reached. Never goes backward.
                      Rounds beyond it are locked (blurred/inert).
     activeRound      which round the trail's traveler rides — driven
                      by scroll, clamped to screenIdx so scrolling past
                      a locked round never counts as "arriving".
     justCompletedIdx the round that flashes right after its button is
                      pressed; null the rest of the time.
========================================================= */

// Where, as a fraction of the viewport height, a round counts as "the
// one being read": the last round whose top has scrolled above it.
export const READING_LINE_FRAC = 0.35;

export const initialFlow = () => ({ screenIdx: 0, activeRound: 0, justCompletedIdx: null });

// Completing a round: flash the one just left, unlock up to `toIdx`.
// screenIdx tracks the furthest round reached, so going "forward" to an
// earlier index (re-pressing an old button) never re-locks anything.
export function advanceFlow(state, toIdx) {
  return {
    ...state,
    justCompletedIdx: state.screenIdx,
    screenIdx: Math.max(state.screenIdx, toIdx),
  };
}

export function clearFlash(state) {
  return state.justCompletedIdx === null ? state : { ...state, justCompletedIdx: null };
}

// Scroll-driven: the active round can't run ahead of what's unlocked.
export function setActiveRound(state, idx) {
  const activeRound = Math.min(idx, state.screenIdx);
  return activeRound === state.activeRound ? state : { ...state, activeRound };
}

export function isRoundLocked(state, i) {
  return i > state.screenIdx;
}

// Which classes a round's <section> should have, as a { class: boolean } map
// — the shape Lit's classMap() directive wants (no string concatenation,
// no stray double spaces).
export function roundClassMap(state, i) {
  return {
    round: true,
    'round-pending': isRoundLocked(state, i),
    'round-just-completed': state.justCompletedIdx === i,
  };
}

// Index of the last round whose top edge is at or above the reading
// line. Deliberately "last one above the line", not "most visible area":
// adjacent rounds are often both partly visible, and an area race
// flickers right at the boundary.
export function activeIndexFromTops(tops, readingLine) {
  let active = 0;
  tops.forEach((top, i) => {
    if (top <= readingLine) active = i;
  });
  return active;
}
