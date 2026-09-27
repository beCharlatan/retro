// test/unit/hidden-profile.test.js
// The dossiers of the hidden-profile game (src/logic/hidden-profile.js). The
// whole game rests on their balance: by ANY single card Саша must look best,
// by ALL cards together Женя must. And no fact may give away a candidate's
// gender through a past-tense verb.
import { describe, expect, test } from 'bun:test';
import {
  HP_CARD_COUNT,
  HP_CARDS,
  HP_SHARED,
  HP_UNIQUE_PLUSES,
  hiddenProfileResults,
  hpCardFacts,
  hpCardFor,
  hpMessage,
} from '../../src/logic/hidden-profile.js';

// plus minus minus per candidate, from what the given cards contain
function score(cards) {
  const s = {};
  for (const [id, facts] of Object.entries(HP_SHARED))
    s[id] = facts.reduce((a, f) => a + f.sign, 0);
  for (const k of cards) {
    s.zhenya += HP_CARDS[k].zhenya.length;
    s.sasha -= 1;
  }
  return s;
}

describe('the balance of the dossiers', () => {
  test('by any single card Саша looks best and Женя worst', () => {
    for (let k = 0; k < HP_CARD_COUNT; k++) {
      const s = score([k]);
      expect(s.sasha).toBeGreaterThan(s.valya);
      expect(s.sasha).toBeGreaterThan(s.zhenya);
    }
  });

  test('by all cards together Женя is clearly best — even with only 3 players', () => {
    for (const cards of [
      [0, 1, 2, 3],
      [0, 1, 2],
    ]) {
      const s = score(cards);
      expect(s.zhenya).toBeGreaterThan(s.valya);
      expect(s.zhenya).toBeGreaterThan(s.sasha);
    }
  });

  test('every card has 15 facts: 5 per candidate', () => {
    for (let k = 0; k < HP_CARD_COUNT; k++) {
      const f = hpCardFacts(k);
      expect([f.sasha.length, f.zhenya.length, f.valya.length]).toEqual([5, 5, 5]);
    }
  });

  test('8 unique pluses of Женя, two per card', () => {
    expect(HP_UNIQUE_PLUSES).toHaveLength(8);
  });

  test('no fact uses a gendered past-tense form', () => {
    const all = [
      ...Object.values(HP_SHARED).flatMap((fs) => fs.map((f) => f.text)),
      ...HP_CARDS.flatMap((c) => [...c.zhenya, c.sasha]),
    ];
    for (const text of all) expect([text, /\b\p{L}+(л|ла)\b/u.test(text)]).toEqual([text, false]);
  });
});

describe('dealing and messages', () => {
  test('cards go 1–4 in turn', () => {
    expect([0, 1, 2, 3, 4, 5].map(hpCardFor)).toEqual([0, 1, 2, 3, 0, 1]);
  });

  test('the same card always reads the same, different cards differ', () => {
    expect(hpMessage(1, 3)).toEqual(hpMessage(1, 3));
    expect(hpMessage(0, 3)).not.toEqual(hpMessage(1, 3));
  });

  test("a message has the card's unique facts, never the other cards'", () => {
    const m = hpMessage(2, 3);
    for (const t of HP_CARDS[2].zhenya) expect(m).toContain(t);
    expect(m).toContain(HP_CARDS[2].sasha);
    for (const t of HP_CARDS[0].zhenya) expect(m).not.toContain(t);
    expect(m).not.toMatch(/[➕➖＋]/); // no pluses/minuses given away
  });
});

describe('hiddenProfileResults', () => {
  const rows = [
    { name: 'А', card: 0, vote: 'sasha' },
    { name: 'Б', card: 1, vote: 'sasha' },
    { name: 'В', card: 2, vote: 'zhenya' },
    { name: 'Г', card: 3, vote: null },
  ];

  test('counts solo votes and whether the team found the best', () => {
    const r = hiddenProfileResults(rows, 'zhenya', 3);
    expect(r.soloVotes).toEqual({ sasha: 2, zhenya: 1, valya: 0 });
    expect(r.total).toBe(3);
    expect(r.foundBest).toBe(true);
    expect(r.surfaced).toBe(3);
  });

  test('surfaced stays null when the checklist was skipped', () => {
    expect(hiddenProfileResults(rows, 'sasha').surfaced).toBeNull();
  });

  test('nothing entered → null', () => {
    expect(
      hiddenProfileResults(
        rows.map((r) => ({ ...r, vote: null })),
        null,
      ),
    ).toBeNull();
  });
});
