// test/unit/weakest-link.test.js
// The minimum-effort game (src/logic/weakest-link.js): the payoff table matches
// Van Huyck et al. (×100), the minimum rules the round, and missing answers
// never turn into NaN.
import { describe, expect, test } from 'bun:test';
import {
  WL_ROUNDS,
  weakestLinkResults,
  weakestLinkRound,
  wlPayoff,
} from '../../src/logic/weakest-link.js';

const row = (name, efforts) => ({
  name,
  efforts: [...efforts, ...Array(WL_ROUNDS - efforts.length).fill(null)],
});

describe('wlPayoff', () => {
  test('the corners of the original table', () => {
    expect(wlPayoff(7, 7)).toBe(130); // everyone at the top
    expect(wlPayoff(1, 1)).toBe(70); // the safe choice
    expect(wlPayoff(7, 1)).toBe(10); // a lone 7 next to a 1
  });

  test('at a given minimum, every extra point of effort costs 10', () => {
    expect(wlPayoff(4, 3) - wlPayoff(5, 3)).toBe(10);
  });
});

describe('weakestLinkRound', () => {
  test('minimum, counts per effort and the share of 7s', () => {
    const r = weakestLinkRound([row('А', [7]), row('Б', [7]), row('В', [3]), row('Г', [5])], 0);
    expect(r.min).toBe(3);
    expect(r.n).toBe(4);
    expect(r.counts).toEqual([0, 0, 1, 0, 1, 0, 2]);
    expect(r.share7).toBe(50);
    // payoffs at min 3: 7→50, 7→50, 3→90, 5→70 → mean 65
    expect(r.avgPayoff).toBe(65);
  });

  test('people not entered yet are left out; an empty round is null', () => {
    expect(weakestLinkRound([row('А', [6]), row('Б', [])], 0).min).toBe(6);
    expect(weakestLinkRound([row('А', []), row('Б', [])], 0)).toBeNull();
  });
});

describe('weakestLinkResults', () => {
  const rows = [row('А', [7, 6, 5, 7, 7]), row('Б', [4, 3, 2, 7, 6]), row('В', [7, 7, 7, 7, 7])];

  test('minimum per round and the effect of the talk before round 4', () => {
    const r = weakestLinkResults(rows);
    expect(r.minByRound).toEqual([4, 3, 2, 7, 6]);
    expect(r.talkEffect).toBe(5); // round 4 minus round 3
    expect(r.share7ByRound[0]).toBe(67);
  });

  test('each person earns the sum of their rounds', () => {
    const r = weakestLinkResults(rows);
    const b = r.people.find((p) => p.name === 'Б');
    // (4,4)=100 (3,3)=90 (2,2)=80 (7,7)=130 (6,6)=120
    expect(b.total).toBe(520);
  });

  test('rounds not played stay null, not NaN', () => {
    const r = weakestLinkResults([row('А', [5, 4]), row('Б', [6, 4])]);
    expect(r.minByRound).toEqual([5, 4, null, null, null]);
    expect(r.talkEffect).toBeNull();
    expect(JSON.stringify(r)).not.toContain('NaN');
  });

  test('no answers at all → null', () => {
    expect(weakestLinkResults([row('А', []), row('Б', [])])).toBeNull();
  });
});
