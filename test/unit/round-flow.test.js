// test/unit/round-flow.test.js — pure rules for the one-scroll layout.
import { describe, expect, test } from 'bun:test';
import {
  activeIndexFromTops,
  advanceFlow,
  clearFlash,
  initialFlow,
  isRoundLocked,
  roundClassMap,
  setActiveRound,
} from '../../src/logic/round-flow.js';

describe('advanceFlow', () => {
  test('unlocks up to the target and flashes the round just finished', () => {
    const next = advanceFlow(initialFlow(), 1);
    expect(next.screenIdx).toBe(1);
    expect(next.justCompletedIdx).toBe(0);
  });

  test('never moves screenIdx backward (re-pressing an old button)', () => {
    let s = advanceFlow(initialFlow(), 3);
    s = advanceFlow(s, 1);
    expect(s.screenIdx).toBe(3);
    // ...but the round the player pressed from still flashes.
    expect(s.justCompletedIdx).toBe(3);
  });

  test('does not mutate the previous state', () => {
    const before = initialFlow();
    advanceFlow(before, 2);
    expect(before).toEqual({ screenIdx: 0, activeRound: 0, justCompletedIdx: null });
  });

  test('can skip several rounds at once (e.g. straight to results)', () => {
    expect(advanceFlow({ screenIdx: 1, activeRound: 1, justCompletedIdx: null }, 4).screenIdx).toBe(
      4,
    );
  });
});

describe('clearFlash', () => {
  test('resets the flash marker', () => {
    expect(clearFlash(advanceFlow(initialFlow(), 1)).justCompletedIdx).toBeNull();
  });
  test('returns the same object when there is nothing to clear', () => {
    const s = initialFlow();
    expect(clearFlash(s)).toBe(s);
  });
});

describe('setActiveRound', () => {
  test('follows scroll up to the unlocked frontier', () => {
    const s = { screenIdx: 2, activeRound: 0, justCompletedIdx: null };
    expect(setActiveRound(s, 1).activeRound).toBe(1);
    expect(setActiveRound(s, 2).activeRound).toBe(2);
  });
  test('scrolling past a locked round does not count as arriving', () => {
    const s = { screenIdx: 1, activeRound: 1, justCompletedIdx: null };
    expect(setActiveRound(s, 4).activeRound).toBe(1);
  });
  test('returns the same object when nothing changes (no needless re-render)', () => {
    const s = { screenIdx: 2, activeRound: 2, justCompletedIdx: null };
    expect(setActiveRound(s, 2)).toBe(s);
    expect(setActiveRound(s, 9)).toBe(s);
  });
});

describe('locking and class names', () => {
  const s = { screenIdx: 2, activeRound: 2, justCompletedIdx: 1 };
  test('rounds beyond screenIdx are locked', () => {
    expect(isRoundLocked(s, 2)).toBe(false);
    expect(isRoundLocked(s, 3)).toBe(true);
  });
  test('a locked round is round-pending, the flashed one round-just-completed, every one is a round', () => {
    expect(roundClassMap(s, 3)).toEqual({
      round: true,
      'round-pending': true,
      'round-just-completed': false,
    });
    expect(roundClassMap(s, 1)).toEqual({
      round: true,
      'round-pending': false,
      'round-just-completed': true,
    });
    expect(roundClassMap(s, 0)).toEqual({
      round: true,
      'round-pending': false,
      'round-just-completed': false,
    });
  });
  test('a flashing round is never one that is still locked', () => {
    // justCompletedIdx is always a round the player has been on, so never beyond screenIdx.
    const flashed = advanceFlow(initialFlow(), 2);
    expect(roundClassMap(flashed, flashed.justCompletedIdx)['round-pending']).toBe(false);
  });
});

describe('activeIndexFromTops', () => {
  test('is the last round whose top is at or above the reading line', () => {
    expect(activeIndexFromTops([-900, -300, 250, 900], 300)).toBe(2);
    expect(activeIndexFromTops([-900, -300, 300, 900], 300)).toBe(2);
  });
  test('falls back to the first round when nothing has reached the line', () => {
    expect(activeIndexFromTops([500, 1200], 300)).toBe(0);
  });
  test('handles an empty list', () => {
    expect(activeIndexFromTops([], 300)).toBe(0);
  });
});
