// test/unit/lemons.test.js
// The market for lemons (src/logic/lemons.js): the values are set so good
// cars MUST leave a blind market, the draw is complete and reproducible, and
// payoffs, surplus and the inspection cost add up.
import { describe, expect, test } from 'bun:test';
import {
  drawRounds,
  LM_CERT_COST,
  LM_CERT_ROUND,
  LM_ROUNDS,
  LM_VALUES,
  lemonsMessage,
  lemonsPayoffs,
  lemonsResults,
  nextBuyer,
  roundStats,
  splitMarket,
} from '../../src/logic/lemons.js';

// a tiny seeded generator, so the draws are reproducible
const seeded =
  (seed = 1) =>
  () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

describe('the values', () => {
  test('a blind buyer pays on average less than a good car is worth to its owner', () => {
    const blind = (LM_VALUES.good.buyer + LM_VALUES.lemon.buyer) / 2;
    expect(blind).toBeLessThan(LM_VALUES.good.seller);
  });

  test('with full information every trade is worth making', () => {
    for (const v of Object.values(LM_VALUES)) expect(v.buyer).toBeGreaterThan(v.seller);
  });
});

describe('splitMarket / drawRounds', () => {
  const names = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж'];

  test('sellers are the smaller half; nobody is lost', () => {
    const m = splitMarket(names, seeded(3));
    expect(m.sellers).toHaveLength(3);
    expect(m.buyers).toHaveLength(4);
    expect([...m.sellers, ...m.buyers].sort()).toEqual(names.slice().sort());
  });

  test('every round: one lot per seller, lot numbers 1..n, every buyer in the queue', () => {
    const m = splitMarket(names, seeded(3));
    const rounds = drawRounds(m, seeded(5));
    expect(rounds).toHaveLength(LM_ROUNDS);
    for (const r of rounds) {
      expect(r.lots.map((l) => l.lot).sort()).toEqual([1, 2, 3]);
      expect(r.order.slice().sort()).toEqual(m.buyers.slice().sort());
      for (const l of r.lots) expect(['good', 'lemon']).toContain(l.quality);
    }
  });

  test('the same seed draws the same market', () => {
    const m = splitMarket(names, seeded(9));
    expect(drawRounds(m, seeded(2))).toEqual(drawRounds(m, seeded(2)));
  });
});

// one hand-built round: a good car sold at 90, a lemon sold at 60, a good car kept
function round() {
  return {
    lots: [
      { seller: 'А', lot: 1, quality: 'good', price: 90, selling: true, cert: false, buyer: 'Г' },
      { seller: 'Б', lot: 2, quality: 'lemon', price: 60, selling: true, cert: false, buyer: 'Д' },
      {
        seller: 'В',
        lot: 3,
        quality: 'good',
        price: null,
        selling: false,
        cert: false,
        buyer: null,
      },
    ],
    order: ['Г', 'Д', 'Е'],
    picks: { Г: 1, Д: 2 },
    revealed: true,
  };
}
const market = { sellers: ['А', 'Б', 'В'], buyers: ['Г', 'Д', 'Е'] };

describe('roundStats', () => {
  test('listed, sold, good among them, average price', () => {
    const s = roundStats(round());
    expect([s.listed, s.sold, s.goodSold]).toEqual([2, 2, 1]);
    expect(s.goodShareSold).toBe(50);
    expect(s.avgPrice).toBe(75);
  });

  test('surplus: only trades that happened, against every car there was', () => {
    const s = roundStats(round());
    expect(s.surplus).toBe(20 + 20);
    expect(s.maxSurplus).toBe(20 * 3);
  });
});

describe('payoffs', () => {
  test('buyer gets value − price, seller price − value, keeping the car is 0', () => {
    const p = lemonsPayoffs([round()], market);
    expect(p.get('Г')).toBe(100 - 90);
    expect(p.get('Д')).toBe(30 - 60); // bought a lemon
    expect(p.get('А')).toBe(90 - 80);
    expect(p.get('Б')).toBe(60 - 10);
    expect(p.get('В')).toBe(0);
    expect(p.get('Е')).toBe(0); // did not buy
  });

  test('an inspection costs the seller even if the car does not sell', () => {
    const r = round();
    r.lots[2] = { ...r.lots[2], selling: true, price: 120, cert: true };
    expect(lemonsPayoffs([r], market).get('В')).toBe(-LM_CERT_COST);
  });

  test('rounds not revealed yet are not counted', () => {
    expect(lemonsPayoffs([{ ...round(), revealed: false }], market).get('Г')).toBe(0);
  });
});

describe('queue, results, messages', () => {
  test('the next buyer is the first in the queue without a pick', () => {
    expect(nextBuyer(round())).toBe('Е');
    expect(nextBuyer({ ...round(), picks: { Г: 1, Д: 2, Е: 'pass' } })).toBeNull();
  });

  test('results per round, unplayed rounds null', () => {
    const r = lemonsResults([round(), { ...round(), revealed: false }], market);
    expect(r.goodSoldByRound).toEqual([50, null]);
    expect(r.surplusPct).toBe(67);
    expect(lemonsResults([{ ...round(), revealed: false }], market)).toBeNull();
  });

  test('a seller learns their quality; the inspection is offered only in its round', () => {
    const lot = round().lots[1];
    expect(lemonsMessage(0, lot)).toContain('ЛИМОН');
    expect(lemonsMessage(0, lot)).not.toContain('проверк');
    expect(lemonsMessage(LM_CERT_ROUND - 1, lot)).toContain('проверк');
  });
});
