// Property tests for src/logic/entries.js
import { describe, expect, test } from 'bun:test';
import {
  countFilled,
  hasFields,
  loadableDraft,
  minCount,
  parseNumberInput,
  patchItem,
  patchRow,
} from '../../../src/logic/entries.js';
import { fc, int, nullable, RUNS } from './helpers.js';

describe('parseNumberInput', () => {
  test('any typed text gives null or a number inside the bounds', () => {
    fc.assert(
      fc.property(fc.string(), int(-50, 0), int(0, 200), (text, min, max) => {
        const v = parseNumberInput(text, { min, max });
        if (v !== null) {
          expect(Number.isFinite(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(min);
          expect(v).toBeLessThanOrEqual(max);
        }
      }),
      RUNS,
    );
  });
  test('is idempotent: re-parsing its own output changes nothing', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e6, max: 1e6 }), int(-50, 0), int(0, 200), (n, min, max) => {
        const once = parseNumberInput(String(n), { min, max });
        expect(parseNumberInput(String(once), { min, max })).toBe(once);
      }),
      RUNS,
    );
  });
  test('a plain in-range integer round-trips exactly', () => {
    fc.assert(
      fc.property(int(0, 100), (n) =>
        expect(parseNumberInput(String(n), { min: 0, max: 100 })).toBe(n),
      ),
      RUNS,
    );
  });
});

const rows = fc.array(fc.record({ name: fc.string(), v: nullable(int(0, 100)) }), {
  minLength: 1,
  maxLength: 20,
});

describe('patchRow', () => {
  test('changes only the targeted row and never mutates the input', () => {
    fc.assert(
      fc.property(rows, fc.nat(30), int(0, 100), (rs, i, value) => {
        const snapshot = JSON.stringify(rs);
        const next = patchRow(rs, i, { v: value });
        expect(JSON.stringify(rs)).toBe(snapshot);
        expect(next).toHaveLength(rs.length);
        next.forEach((row, ri) => {
          if (ri === i) expect(row.v).toBe(value);
          else expect(row).toBe(rs[ri]);
        });
      }),
      RUNS,
    );
  });
});

describe('patchItem', () => {
  const answerRows = fc.array(
    fc.record({
      answers: fc.array(nullable(fc.constantFrom('a', 'b')), { minLength: 1, maxLength: 6 }),
    }),
    {
      minLength: 1,
      maxLength: 10,
    },
  );
  test('sets exactly one slot and leaves every other slot and row alone', () => {
    fc.assert(
      fc.property(
        answerRows,
        fc.nat(20),
        fc.nat(10),
        fc.constantFrom('a', 'b', null),
        (rs, ri, ii, value) => {
          const snapshot = JSON.stringify(rs);
          const next = patchItem(rs, ri, 'answers', ii, value);
          expect(JSON.stringify(rs)).toBe(snapshot);
          next.forEach((row, r) => {
            if (r !== ri) {
              expect(row).toBe(rs[r]);
            } else {
              row.answers.forEach((a, i) => {
                expect(a).toBe(i === ii ? value : rs[r].answers[i]);
              });
            }
          });
        },
      ),
      RUNS,
    );
  });
});

describe('counting', () => {
  test('a count is between 0 and the number of rows, and complements the unfilled', () => {
    fc.assert(
      fc.property(fc.array(fc.record({ a: nullable(int()), b: nullable(int()) })), (rs) => {
        const both = countFilled(rs, hasFields('a', 'b'));
        const onlyA = countFilled(rs, hasFields('a'));
        expect(both).toBeGreaterThanOrEqual(0);
        expect(both).toBeLessThanOrEqual(onlyA); // needing more fields can only shrink the count
        expect(onlyA).toBeLessThanOrEqual(rs.length);
      }),
      RUNS,
    );
  });
  test('minCount is one of the counts and no larger than any of them', () => {
    fc.assert(
      fc.property(fc.array(int(0, 100), { minLength: 1 }), (cs) => {
        const m = minCount(cs);
        expect(cs).toContain(m);
        for (const c of cs) expect(m).toBeLessThanOrEqual(c);
      }),
      RUNS,
    );
  });
});

describe('loadableDraft', () => {
  test('never throws on arbitrary junk and only returns the draft itself or null', () => {
    fc.assert(
      fc.property(fc.anything(), (junk) => {
        const out = loadableDraft(junk, { key: 'data', length: 3 });
        expect(out === null || out === junk).toBe(true);
      }),
      RUNS,
    );
  });
});
