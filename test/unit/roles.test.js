// test/unit/roles.test.js
// bun:test unit tests for src/roles.js — pure functions, no DOM, so
// they run in milliseconds instead of the ~3 minutes the full
// Playwright suite takes. See test/unit/README.md for how this layer
// fits alongside test/*.spec.js.
import { describe, expect, test } from 'bun:test';
import { Roles } from '../../src/roles.js';

const NAMES = ['Аня', 'Боря', 'Вика', 'Гоша', 'Даша', 'Егор'];

describe('Roles.shuffle', () => {
  test('returns every element from the input, same multiset', () => {
    const result = Roles.shuffle(NAMES);
    expect(result.length).toBe(NAMES.length);
    expect([...result].sort()).toEqual([...NAMES].sort());
  });

  test('does not mutate the input array', () => {
    const original = [...NAMES];
    Roles.shuffle(NAMES);
    expect(NAMES).toEqual(original);
  });

  test('returns a new array, not the same reference', () => {
    expect(Roles.shuffle(NAMES)).not.toBe(NAMES);
  });

  test('actually shuffles — not the same order every time', () => {
    // Statistically this could in principle fail (all 30 shuffles of 6
    // people happening to match input order), but the odds are on the
    // order of 1 in 720^30 — not a real flakiness concern.
    const longList = Array.from({ length: 8 }, (_, i) => `p${i}`);
    const anyDifferent = Array.from({ length: 30 }, () => Roles.shuffle(longList)).some((result) =>
      result.some((name, i) => name !== longList[i]),
    );
    expect(anyDifferent).toBe(true);
  });
});

describe('Roles.makePairs — even count', () => {
  test('splits everyone into disjoint pairs with no observer or trio', () => {
    const { pairs, observer, trio } = Roles.makePairs(NAMES);
    expect(pairs.length).toBe(NAMES.length / 2);
    expect(observer).toBeNull();
    expect(trio).toBeNull();
  });

  test('every participant appears in exactly one pair', () => {
    const { pairs } = Roles.makePairs(NAMES);
    const seen = pairs.flatMap((p) => [p.a, p.b]);
    expect(seen.length).toBe(NAMES.length);
    expect([...seen].sort()).toEqual([...NAMES].sort());
  });

  test('no pair is flagged as a trio', () => {
    const { pairs } = Roles.makePairs(NAMES);
    expect(pairs.every((p) => !p.trio)).toBe(true);
  });
});

describe('Roles.makePairs — odd count (>= 3): trio instead of an observer', () => {
  const ODD_NAMES = [...NAMES, 'Женя']; // 7 people

  test('nobody sits out — observer is null', () => {
    const { observer } = Roles.makePairs(ODD_NAMES);
    expect(observer).toBeNull();
  });

  test('produces exactly 3 trio-flagged pairs plus plain pairs for the rest', () => {
    const { pairs } = Roles.makePairs(ODD_NAMES);
    const trioPairs = pairs.filter((p) => p.trio);
    const plainPairs = pairs.filter((p) => !p.trio);
    expect(trioPairs.length).toBe(3);
    expect(plainPairs.length).toBe((ODD_NAMES.length - 3) / 2);
  });

  test('assignment.trio lists exactly the 3 people forming the triangle', () => {
    const { trio } = Roles.makePairs(ODD_NAMES);
    expect(trio).not.toBeNull();
    expect(trio.length).toBe(3);
    expect(new Set(trio).size).toBe(3);
  });

  test('each trio member appears in exactly 2 of the 3 trio pairs (a triangle)', () => {
    const { pairs, trio } = Roles.makePairs(ODD_NAMES);
    const trioPairs = pairs.filter((p) => p.trio);
    for (const name of trio) {
      const appearances = trioPairs.filter((p) => p.a === name || p.b === name).length;
      expect(appearances).toBe(2);
    }
  });

  test('every participant (trio + regular) appears exactly once overall in role slots, except trio members who appear twice', () => {
    const { pairs, trio } = Roles.makePairs(ODD_NAMES);
    const counts = new Map();
    for (const p of pairs) {
      counts.set(p.a, (counts.get(p.a) || 0) + 1);
      counts.set(p.b, (counts.get(p.b) || 0) + 1);
    }
    for (const name of ODD_NAMES) {
      expect(counts.get(name)).toBe(trio.includes(name) ? 2 : 1);
    }
  });
});

describe('Roles.makePairs — degenerate case (fewer than 3 people)', () => {
  test('a single person becomes the observer, with no pairs and no trio', () => {
    const { pairs, observer, trio } = Roles.makePairs(['Соло']);
    expect(pairs).toEqual([]);
    expect(observer).toBe('Соло');
    expect(trio).toBeNull();
  });

  test('two people form one plain pair, no observer', () => {
    const { pairs, observer, trio } = Roles.makePairs(['А', 'Б']);
    expect(pairs.length).toBe(1);
    expect(observer).toBeNull();
    expect(trio).toBeNull();
  });
});

describe('Roles.makeGroups', () => {
  test('even count splits into two equal groups', () => {
    const { groupA, groupB } = Roles.makeGroups(NAMES);
    expect(groupA.length).toBe(3);
    expect(groupB.length).toBe(3);
  });

  test('odd count gives group A the extra person', () => {
    const { groupA, groupB } = Roles.makeGroups([...NAMES, 'Женя']);
    expect(groupA.length).toBe(4);
    expect(groupB.length).toBe(3);
  });

  test('together the groups contain everyone exactly once', () => {
    const { groupA, groupB } = Roles.makeGroups(NAMES);
    const all = [...groupA, ...groupB];
    expect(all.length).toBe(NAMES.length);
    expect([...all].sort()).toEqual([...NAMES].sort());
  });
});

describe('Roles.swapInPairs', () => {
  test('swaps two people in different pairs', () => {
    const pairs = [
      { a: 'А', b: 'Б' },
      { a: 'В', b: 'Г' },
    ];
    Roles.swapInPairs(pairs, 'Б', 'В');
    expect(pairs).toEqual([
      { a: 'А', b: 'В' },
      { a: 'Б', b: 'Г' },
    ]);
  });

  test('swaps two people within the same pair (flips sides)', () => {
    const pairs = [{ a: 'А', b: 'Б' }];
    Roles.swapInPairs(pairs, 'А', 'Б');
    expect(pairs).toEqual([{ a: 'Б', b: 'А' }]);
  });

  test('preserves the .trio flag on the pairs that carry it', () => {
    const pairs = [
      { a: 'А', b: 'Б', trio: true },
      { a: 'В', b: 'Г' },
    ];
    Roles.swapInPairs(pairs, 'Б', 'В');
    expect(pairs[0].trio).toBe(true);
    expect(pairs[1].trio).toBeUndefined();
  });

  test('is a no-op when swapping a name with itself', () => {
    const pairs = [{ a: 'А', b: 'Б' }];
    Roles.swapInPairs(pairs, 'А', 'А');
    expect(pairs).toEqual([{ a: 'А', b: 'Б' }]);
  });

  test('is a no-op when one name is not found (e.g. an observer)', () => {
    const pairs = [{ a: 'А', b: 'Б' }];
    Roles.swapInPairs(pairs, 'А', 'Наблюдатель');
    expect(pairs).toEqual([{ a: 'А', b: 'Б' }]);
  });

  test('regression: corrupts a trio when one of the two names is a trio member (self-pairing bug)', () => {
    // The exact trio triangle makePairs() produces for 3 people — "Б"
    // sits in two slots (pairs[0].b and pairs[1].a). Swapping "Б" (found
    // last at pairs[1].a) with "Г" resolves BOTH of "Б"'s occurrences to
    // that same last-found slot, so pairs[0].b never actually changes —
    // it's still "Б" — while pairs[1].a becomes "Г". Net effect: "Б" is
    // untouched at pairs[0], and pairs[1] becomes {a:'Г', b:'В'}, i.e.
    // "Г" got swapped in without "Б" ever leaving. This test pins down
    // that swapInPairs is unsafe here — swapPairsAt below is the fix.
    const pairs = [
      { a: 'А', b: 'Б', trio: true },
      { a: 'Б', b: 'В', trio: true },
      { a: 'В', b: 'А', trio: true },
    ];
    Roles.swapInPairs(pairs, 'Б', 'Г');
    // "Б" was never actually removed from the trio — this is the bug.
    expect(pairs[0].b).toBe('Б');
  });
});

describe('Roles.swapPairsAt', () => {
  test('swaps two people in different pairs, by exact slot', () => {
    const pairs = [
      { a: 'А', b: 'Б' },
      { a: 'В', b: 'Г' },
    ];
    Roles.swapPairsAt(pairs, { i: 0, side: 'b' }, { i: 1, side: 'a' });
    expect(pairs).toEqual([
      { a: 'А', b: 'В' },
      { a: 'Б', b: 'Г' },
    ]);
  });

  test('swaps two people within the same pair (flips sides)', () => {
    const pairs = [{ a: 'А', b: 'Б' }];
    Roles.swapPairsAt(pairs, { i: 0, side: 'a' }, { i: 0, side: 'b' });
    expect(pairs).toEqual([{ a: 'Б', b: 'А' }]);
  });

  test('is a no-op when both positions are the exact same slot', () => {
    const pairs = [{ a: 'А', b: 'Б' }];
    Roles.swapPairsAt(pairs, { i: 0, side: 'a' }, { i: 0, side: 'a' });
    expect(pairs).toEqual([{ a: 'А', b: 'Б' }]);
  });

  test('correctly swaps a trio member out by exact slot, without self-pairing or duplicating', () => {
    // Same trio triangle as the swapInPairs regression above, but now
    // identifying "Б"'s clicked occurrence unambiguously by slot
    // (pairs[0].b) instead of by name — swapped with a slot holding a
    // different value ("В" at pairs[2].a) so the swap actually changes
    // something observable.
    const pairs = [
      { a: 'А', b: 'Б', trio: true },
      { a: 'Б', b: 'В', trio: true },
      { a: 'В', b: 'А', trio: true },
    ];
    Roles.swapPairsAt(pairs, { i: 0, side: 'b' }, { i: 2, side: 'a' });
    expect(pairs[0]).toEqual({ a: 'А', b: 'В', trio: true });
    expect(pairs[2]).toEqual({ a: 'Б', b: 'А', trio: true });
    // No self-pair anywhere, no name duplicated within a single pair.
    for (const p of pairs) expect(p.a).not.toBe(p.b);
  });
});

describe('Roles.swapInGroups', () => {
  test('swaps two people between different groups', () => {
    const groups = { groupA: ['А', 'Б'], groupB: ['В', 'Г'] };
    Roles.swapInGroups(groups, 'Б', 'В');
    expect(groups).toEqual({ groupA: ['А', 'В'], groupB: ['Б', 'Г'] });
  });

  test('keeps group sizes unchanged after a swap', () => {
    const groups = { groupA: ['А', 'Б', 'Д'], groupB: ['В', 'Г'] };
    Roles.swapInGroups(groups, 'Д', 'Г');
    expect(groups.groupA.length).toBe(3);
    expect(groups.groupB.length).toBe(2);
  });

  test('is a no-op when both people are already in the same group', () => {
    const groups = { groupA: ['А', 'Б'], groupB: ['В', 'Г'] };
    Roles.swapInGroups(groups, 'А', 'Б');
    expect(groups).toEqual({ groupA: ['А', 'Б'], groupB: ['В', 'Г'] });
  });

  test('is a no-op when swapping a name with itself', () => {
    const groups = { groupA: ['А', 'Б'], groupB: ['В', 'Г'] };
    Roles.swapInGroups(groups, 'А', 'А');
    expect(groups).toEqual({ groupA: ['А', 'Б'], groupB: ['В', 'Г'] });
  });

  test('is a no-op when a name is not found in either group', () => {
    const groups = { groupA: ['А', 'Б'], groupB: ['В', 'Г'] };
    Roles.swapInGroups(groups, 'А', 'Призрак');
    expect(groups).toEqual({ groupA: ['А', 'Б'], groupB: ['В', 'Г'] });
  });
});
