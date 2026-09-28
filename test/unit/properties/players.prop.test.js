// Properties of the team list: whatever is typed, the list stays valid.
import { describe, expect, test } from 'bun:test';
import * as fc from 'fast-check';
import {
  addMany,
  cleanName,
  deserializePlayers,
  MAX_NAME,
  MAX_PLAYERS,
  parseNames,
  sameName,
  serializePlayers,
} from '../../../src/logic/players.js';

const RUNS = { numRuns: 200 };
const text = fc.string({ maxLength: 60 });

const valid = (players) =>
  players.length <= MAX_PLAYERS &&
  players.every((p, i) => {
    const n = p.name;
    return (
      n === cleanName(n) &&
      n.length > 0 &&
      n.length <= MAX_NAME &&
      typeof p.active === 'boolean' &&
      players.findIndex((q) => sameName(q.name, n)) === i
    );
  });

describe('players (properties)', () => {
  test('whatever is added, the list is valid: cleaned, non-empty, short, unique, bounded', () => {
    fc.assert(
      fc.property(fc.array(text, { maxLength: 120 }), (names) => {
        expect(valid(addMany([], names).players)).toBe(true);
      }),
      RUNS,
    );
  });

  test('added + skipped is exactly what was offered', () => {
    fc.assert(
      fc.property(fc.array(text, { maxLength: 80 }), (names) => {
        const r = addMany([], names);
        expect(r.added + r.skipped).toBe(names.length);
        expect(r.players).toHaveLength(r.added);
      }),
      RUNS,
    );
  });

  test('parseNames never returns a blank, an overlong or a repeated name', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (raw) => {
        const names = parseNames(raw);
        for (const [i, n] of names.entries()) {
          expect(n).toBe(cleanName(n));
          expect(n.length).toBeGreaterThan(0);
          expect(n.length).toBeLessThanOrEqual(MAX_NAME);
          expect(names.findIndex((m) => sameName(m, n))).toBe(i);
        }
      }),
      RUNS,
    );
  });

  test('a valid list survives a round trip through storage unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(text, { maxLength: 60 }),
        fc.array(fc.boolean(), { maxLength: 60 }),
        (names, flags) => {
          const list = addMany([], names).players.map((p, i) => ({
            ...p,
            active: flags[i] ?? true,
          }));
          expect(deserializePlayers(serializePlayers(list))).toEqual(list);
        },
      ),
      RUNS,
    );
  });

  test('garbage in storage never throws and never gives an invalid list', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.json()), (raw) => {
        const list = deserializePlayers(raw);
        if (list !== null) expect(valid(list)).toBe(true);
      }),
      RUNS,
    );
  });
});
