// test/unit/volunteer.test.js
// The volunteer's dilemma (src/logic/volunteer.js): groups are split without
// losing anyone, the payoffs follow the rule, and the equilibrium matches
// the table in docs/new-games/volunteer.md.
import { describe, expect, test } from 'bun:test';
import {
  splitIntoGroups,
  VD_COST,
  vdPayoff,
  vdTheory,
  volunteerResults,
  volunteerRound,
} from '../../src/logic/volunteer.js';

const names = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);

describe('splitIntoGroups', () => {
  test('pairs; an odd one out joins a group instead of sitting out', () => {
    expect(splitIntoGroups(names(8), 2).map((g) => g.length)).toEqual([2, 2, 2, 2]);
    expect(
      splitIntoGroups(names(5), 2)
        .map((g) => g.length)
        .sort(),
    ).toEqual([2, 3]);
  });

  test('fours with leftovers dealt over the groups', () => {
    expect(
      splitIntoGroups(names(10), 4)
        .map((g) => g.length)
        .sort(),
    ).toEqual([5, 5]);
  });

  test('too few people for two groups, or Infinity → the whole team', () => {
    expect(splitIntoGroups(names(5), 4)).toEqual([names(5)]);
    expect(splitIntoGroups(names(7), Infinity)).toEqual([names(7)]);
  });

  test('everyone ends up in exactly one group', () => {
    for (const n of [4, 5, 7, 9, 12]) {
      for (const size of [2, 4]) {
        const flat = splitIntoGroups(names(n), size).flat().sort();
        expect(flat).toEqual(names(n).sort());
      }
    }
  });
});

describe('vdPayoff', () => {
  test('someone volunteered: 100 to the others, 100 − cost to the volunteer; nobody: 0', () => {
    expect(vdPayoff('N', true)).toBe(100);
    expect(vdPayoff('V', true)).toBe(100 - VD_COST);
    expect(vdPayoff('N', false)).toBe(0);
  });
});

describe('vdTheory (C/B = 0.4)', () => {
  test('matches the equilibrium table', () => {
    expect(Math.round(vdTheory(2).volunteer * 100)).toBe(60);
    expect(Math.round(vdTheory(2).nobody * 100)).toBe(16);
    expect(Math.round(vdTheory(4).nobody * 100)).toBe(29);
    expect(Math.round(vdTheory(8).nobody * 100)).toBe(35);
  });

  test('bigger group: each volunteers less, and nobody-at-all gets MORE likely', () => {
    for (let n = 2; n < 12; n++) {
      expect(vdTheory(n + 1).volunteer).toBeLessThan(vdTheory(n).volunteer);
      expect(vdTheory(n + 1).nobody).toBeGreaterThan(vdTheory(n).nobody);
    }
    expect(vdTheory(1000).nobody).toBeLessThan(0.4);
  });
});

describe('volunteerRound / volunteerResults', () => {
  const rows = [
    { name: 'А', choices: ['V', 'N', 'N'] },
    { name: 'Б', choices: ['N', 'N', 'N'] },
    { name: 'В', choices: ['N', 'V', 'N'] },
    { name: 'Г', choices: ['N', 'N', 'V'] },
  ];
  const groupsByRound = [
    [
      ['А', 'Б'],
      ['В', 'Г'],
    ],
    [['А', 'Б', 'В', 'Г']],
    [['А', 'Б', 'В', 'Г']],
  ];

  test('a group with no volunteer counts as "nobody took it"', () => {
    const r = volunteerRound(rows, groupsByRound[0], 0);
    expect(r.volunteerRate).toBe(25);
    expect(r.nobodyRate).toBe(50); // В and Г both said no
    expect(r.groups.map((g) => g.saved)).toEqual([true, false]);
  });

  test('payoffs over the three rounds', () => {
    const r = volunteerResults(rows, groupsByRound);
    const total = (n) => r.people.find((p) => p.name === n).total;
    expect(total('А')).toBe(60 + 100 + 100);
    expect(total('Б')).toBe(100 + 100 + 100);
    expect(total('Г')).toBe(0 + 100 + 60);
  });

  test('nobody answered → null', () => {
    const empty = rows.map((r) => ({ ...r, choices: [null, null, null] }));
    expect(volunteerRound(empty, groupsByRound[0], 0)).toBeNull();
    expect(volunteerResults(empty, groupsByRound)).toBeNull();
  });
});
