// test/unit/entries.test.js
// The data-entry helpers behind every game's form (src/logic/entries.js).
import { describe, expect, test } from 'bun:test';
import {
  buildDilemmaEntries,
  buildEndowmentEntries,
  buildFramingEntries,
  buildUltimatumEntries,
  countFilled,
  hasEnough,
  hasFields,
  loadableDraft,
  MIN_FILLED,
  MIN_FILLED_PAIRS,
  minCount,
  parseNumberInput,
  patchItem,
  patchRow,
} from '../../src/logic/entries.js';

describe('parseNumberInput', () => {
  test('empty input means "not answered" (null), not zero', () => {
    expect(parseNumberInput('')).toBeNull();
    expect(parseNumberInput(null)).toBeNull();
    expect(parseNumberInput(undefined)).toBeNull();
  });
  test('parses plain numbers, including 0 and decimals', () => {
    expect(parseNumberInput('42')).toBe(42);
    expect(parseNumberInput('0')).toBe(0);
    expect(parseNumberInput('3.5')).toBe(3.5);
    expect(parseNumberInput('-7')).toBe(-7);
  });
  test('garbage becomes null rather than NaN', () => {
    expect(parseNumberInput('abc')).toBeNull();
  });
  test('clamps to min and max when given', () => {
    expect(parseNumberInput('-5', { min: 0 })).toBe(0);
    expect(parseNumberInput('150', { min: 0, max: 100 })).toBe(100);
    expect(parseNumberInput('50', { min: 0, max: 100 })).toBe(50);
    expect(parseNumberInput('99', { max: 99 })).toBe(99);
  });
  test('bounds do not turn an empty answer into a number', () => {
    expect(parseNumberInput('', { min: 0, max: 10 })).toBeNull();
  });
});

describe('patchRow', () => {
  const rows = [
    { name: 'A', v: null },
    { name: 'B', v: null },
  ];
  test('replaces fields on one row only, leaving the others identical objects', () => {
    const next = patchRow(rows, 1, { v: 7 });
    expect(next[1]).toEqual({ name: 'B', v: 7 });
    expect(next[0]).toBe(rows[0]);
  });
  test('returns a new array and does not mutate the input', () => {
    const next = patchRow(rows, 0, { v: 1 });
    expect(next).not.toBe(rows);
    expect(rows[0].v).toBeNull();
  });
  test('an out-of-range index changes nothing', () => {
    expect(patchRow(rows, 5, { v: 1 })).toEqual(rows);
  });
  test('computed keys work (the games pass { [field]: value })', () => {
    const field = 'v';
    expect(patchRow(rows, 0, { [field]: 3 })[0].v).toBe(3);
  });
});

describe('patchItem', () => {
  const rows = [
    { name: 'A', answers: [null, null] },
    { name: 'B', answers: ['a', null] },
  ];
  test('sets one slot of a row’s array', () => {
    const next = patchItem(rows, 0, 'answers', 1, 'b');
    expect(next[0].answers).toEqual([null, 'b']);
    expect(next[1]).toBe(rows[1]);
  });
  test('does not mutate the original row or array', () => {
    patchItem(rows, 0, 'answers', 0, 'a');
    expect(rows[0].answers).toEqual([null, null]);
  });
  test('accepts an updater function for nested objects (calibration ranges)', () => {
    const rangeRows = [{ ranges: [{ low: null, high: null }] }];
    const next = patchItem(rangeRows, 0, 'ranges', 0, (r) => ({ ...r, low: 5 }));
    expect(next[0].ranges[0]).toEqual({ low: 5, high: null });
    expect(rangeRows[0].ranges[0].low).toBeNull();
  });
  test('a null value is a valid new value, not "no change"', () => {
    const next = patchItem(rows, 1, 'answers', 0, null);
    expect(next[1].answers).toEqual([null, null]);
  });
});

describe('counting filled rows', () => {
  const rows = [
    { a: 1, b: 2 },
    { a: 1, b: null },
    { a: null, b: null },
    { a: 0, b: 0 }, // zero is an answer
  ];
  test('hasFields requires every listed field to be non-null', () => {
    expect(hasFields('a', 'b')(rows[0])).toBe(true);
    expect(hasFields('a', 'b')(rows[1])).toBe(false);
    expect(hasFields('a')(rows[1])).toBe(true);
    expect(hasFields('a', 'b')(rows[3])).toBe(true);
  });
  test('countFilled counts rows matching the predicate', () => {
    expect(countFilled(rows, hasFields('a', 'b'))).toBe(2);
    expect(countFilled(rows, hasFields('a'))).toBe(3);
    expect(countFilled([], hasFields('a'))).toBe(0);
  });
  test('minCount is the scarcest of several counts, and 0 for none', () => {
    expect(minCount([5, 2, 9])).toBe(2);
    expect(minCount([])).toBe(0);
  });
});

describe('hasEnough', () => {
  test('solo games need two complete rows before continuing', () => {
    expect(MIN_FILLED).toBe(2);
    expect(hasEnough(1)).toBe(false);
    expect(hasEnough(2)).toBe(true);
  });
  test('pair games already have two people per row, so one row is enough', () => {
    expect(hasEnough(0, MIN_FILLED_PAIRS)).toBe(false);
    expect(hasEnough(1, MIN_FILLED_PAIRS)).toBe(true);
  });
});

describe('loadableDraft', () => {
  const draft = (payload) => ({ payload, savedAt: 1 });
  test('offers a draft whose rows match the participant count', () => {
    const d = draft({ data: [1, 2, 3] });
    expect(loadableDraft(d, { key: 'data', length: 3 })).toBe(d);
  });
  test('rejects it when the group size changed since it was saved', () => {
    expect(loadableDraft(draft({ data: [1, 2] }), { key: 'data', length: 3 })).toBeNull();
  });
  test('rejects a payload without the expected rows array', () => {
    expect(loadableDraft(draft({ data: 'oops' }), { key: 'data', length: 1 })).toBeNull();
    expect(loadableDraft(draft({}), { key: 'entries', length: 0 })).toBeNull();
  });
  test('nothing saved → nothing to offer', () => {
    expect(loadableDraft(null, { key: 'data', length: 3 })).toBeNull();
    expect(loadableDraft(undefined, { key: 'data' })).toBeNull();
  });
  test('pair games: needs the saved assignment instead of a fixed length', () => {
    const ok = draft({ entries: [1], assignment: { pairs: [] } });
    expect(loadableDraft(ok, { key: 'entries', requires: 'assignment' })).toBe(ok);
    expect(
      loadableDraft(draft({ entries: [1] }), { key: 'entries', requires: 'assignment' }),
    ).toBeNull();
  });
});

describe('blank rows for the role-based games', () => {
  const groups = { groupA: ['Аня', 'Боря'], groupB: ['Вика'] };
  const assignment = {
    pairs: [
      { a: 'Аня', b: 'Боря' },
      { a: 'Вика', b: 'Аня', trio: true },
    ],
  };

  test('endowment: group A owns first and buys second; group B the reverse', () => {
    const rows = buildEndowmentEntries(groups);
    expect(rows.map((r) => r.name)).toEqual(['Аня', 'Боря', 'Вика']);
    expect(rows[0]).toEqual({
      name: 'Аня',
      r1Role: 'owner',
      r2Role: 'buyer',
      r1Price: null,
      r2Price: null,
    });
    expect(rows[2]).toMatchObject({ name: 'Вика', r1Role: 'buyer', r2Role: 'owner' });
  });
  test('endowment: everyone plays each role exactly once', () => {
    for (const r of buildEndowmentEntries(groups))
      expect(new Set([r.r1Role, r.r2Role])).toEqual(new Set(['owner', 'buyer']));
  });

  test('framing: group A rows first, then B, nobody has chosen yet', () => {
    const rows = buildFramingEntries(groups);
    expect(rows.map((r) => r.group)).toEqual(['A', 'A', 'B']);
    expect(rows.every((r) => r.choice === null)).toBe(true);
  });

  test('ultimatum: one blank row per pair, trio flag carried over as a boolean', () => {
    const rows = buildUltimatumEntries(assignment);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      a: 'Аня',
      b: 'Боря',
      trio: false,
      r1_offer: null,
      r1_min: null,
      r2_offer: null,
      r2_min: null,
    });
    expect(rows[1].trio).toBe(true);
  });

  test('dilemma: one blank row per pair with all four moves empty', () => {
    const rows = buildDilemmaEntries(assignment);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      a: 'Аня',
      b: 'Боря',
      trio: false,
      r1a: null,
      r1b: null,
      r2a: null,
      r2b: null,
    });
  });

  test('builders never share row objects (editing one must not touch another)', () => {
    const rows = buildDilemmaEntries(assignment);
    expect(rows[0]).not.toBe(rows[1]);
    const a = buildFramingEntries(groups);
    const b = buildFramingEntries(groups);
    expect(a[0]).not.toBe(b[0]);
  });

  test('empty assignments give empty lists', () => {
    expect(buildUltimatumEntries({ pairs: [] })).toEqual([]);
    expect(buildEndowmentEntries({ groupA: [], groupB: [] })).toEqual([]);
  });
});
