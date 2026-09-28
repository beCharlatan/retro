// test/unit/el-farol.test.js
// The El Farol bar (src/logic/el-farol.js): 60% of the team fit, payoffs
// +1 / −1 / 0, and the silent half of the game compared with the talking half.
import { describe, expect, test } from 'bun:test';
import {
  EF_ROUNDS,
  EF_TALK_FROM,
  efCapacity,
  efPayoff,
  elFarolResults,
  elFarolRound,
} from '../../src/logic/el-farol.js';

// go: a string like '11100000' per person, one digit per evening
const row = (name, go) => ({ name, go: [...go].map((c) => c === '1') });

describe('efCapacity', () => {
  test('60% of the team, rounded down, at least one seat', () => {
    expect(efCapacity(10)).toBe(6);
    expect(efCapacity(8)).toBe(4);
    expect(efCapacity(5)).toBe(3);
    expect(efCapacity(1)).toBe(1);
  });
});

describe('efPayoff', () => {
  test('went to a good evening +1, into a crowd −1, stayed home 0', () => {
    expect(efPayoff(true, false)).toBe(1);
    expect(efPayoff(true, true)).toBe(-1);
    expect(efPayoff(false, true)).toBe(0);
    expect(efPayoff(false, false)).toBe(0);
  });
});

describe('elFarolRound / elFarolResults', () => {
  // capacity 2 of 4; evenings 1–4 chaotic, 5–8 a schedule (2 by 2)
  const rows = [
    row('А', '11101010'),
    row('Б', '10111010'),
    row('В', '01100101'),
    row('Г', '00010101'),
  ];
  const cap = 2;

  test('exactly at capacity is still cosy; one more is a crowd', () => {
    expect(elFarolRound(rows, 0, cap)).toEqual({ came: 2, crowded: false });
    expect(elFarolRound(rows, 2, cap)).toEqual({ came: 3, crowded: true });
  });

  test('attendance, good evenings per half and how far it strayed from the seats', () => {
    const r = elFarolResults(rows, cap);
    expect(r.attendance).toEqual([2, 2, 3, 2, 2, 2, 2, 2]);
    expect(r.goodSilent).toBe(3);
    expect(r.goodTalk).toBe(4);
    expect(r.silentCount).toBe(EF_TALK_FROM - 1);
    expect(r.talkCount).toBe(EF_ROUNDS - EF_TALK_FROM + 1);
    expect(r.spreadSilent).toBe(0.25);
    expect(r.spreadTalk).toBe(0);
  });

  test('points and visits per person', () => {
    const r = elFarolResults(rows, cap);
    const a = r.people.find((p) => p.name === 'А');
    expect(a.visits).toBe(5);
    expect(a.points).toBe(1 + 1 - 1 + 1 + 1); // crowd on evening 3
  });

  test('nobody ever went: every evening cosy, nobody scores', () => {
    const r = elFarolResults([row('А', '00000000'), row('Б', '00000000')], 1);
    expect(r.goodSilent + r.goodTalk).toBe(EF_ROUNDS);
    expect(r.people.every((p) => p.points === 0)).toBe(true);
  });
});
