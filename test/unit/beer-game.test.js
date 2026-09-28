// test/unit/beer-game.test.js
// The beer game engine (src/logic/beer-game.js). The benchmark the results
// screen compares against is a fixed number for the fixed scenario — 384,
// the value docs/new-games/beer-game.md was written around — and the engine
// has to behave like the board game: in balance nothing moves, orders and
// beer take their delays, backlog is carried, costs are 0.5 / 1.
import { describe, expect, test } from 'bun:test';
import {
  BG_BENCHMARK_COST,
  BG_DEMAND_AFTER,
  BG_DEMAND_BEFORE,
  BG_STOCK,
  BG_WEEKS,
  beerResults,
  benchmarkOrders,
  bgDemand,
  bgMessage,
  bgTotal,
  simulate,
} from '../../src/logic/beer-game.js';

const weeks = (n, order) => Array.from({ length: n }, () => [order, order, order, order]);

describe('the benchmark', () => {
  test('costs exactly 384 over the 24 weeks', () => {
    expect(BG_BENCHMARK_COST).toBe(384);
    expect(bgTotal(simulate(benchmarkOrders()).cost)).toBe(384);
  });

  test('is calm: no link ever orders more than 12', () => {
    const orders = benchmarkOrders();
    expect(orders).toHaveLength(BG_WEEKS);
    expect(Math.max(...orders.flat())).toBeLessThanOrEqual(12);
  });

  test('beats simply passing the order on', () => {
    const passOn = [];
    for (let w = 0; w < BG_WEEKS; w++) {
      const { views } = simulate(passOn);
      passOn.push(views.map((v) => v.order));
    }
    expect(bgTotal(simulate(passOn).cost)).toBeGreaterThan(BG_BENCHMARK_COST);
  });
});

describe('demand', () => {
  test('4 for four weeks, then 8 to the end — the only change', () => {
    expect([1, 2, 3, 4].map(bgDemand)).toEqual(Array(4).fill(BG_DEMAND_BEFORE));
    expect([5, 12, 24].map(bgDemand)).toEqual(Array(3).fill(BG_DEMAND_AFTER));
  });
});

describe('simulate', () => {
  test('the first week: every link sees 4 in, 4 ordered, stock 12', () => {
    const { week, views } = simulate([]);
    expect(week).toBe(1);
    for (const v of views) {
      expect(v.arrived).toBe(4);
      expect(v.order).toBe(4);
      expect(v.stock).toBe(BG_STOCK);
      expect(v.backlog).toBe(0);
    }
  });

  test('in balance (ordering 4 before the demand step) nothing moves', () => {
    const { views, cost } = simulate(weeks(3, 4));
    for (const v of views) expect(v.stock).toBe(BG_STOCK);
    // 3 weeks played + the current (4th) one, run up to ordering: 4 × 12 × 0.5
    expect(cost).toEqual([24, 24, 24, 24]);
  });

  test("an order reaches the supplier two weeks later; beer, two weeks after it's shipped", () => {
    const orders = [
      [4, 4, 4, 4],
      [4, 4, 4, 4],
      [9, 4, 4, 4], // the shop orders 9 in week 3
    ];
    for (let w = 0; w < 2; w++) orders.push([4, 4, 4, 4]);
    const w5 = simulate(orders.slice(0, 4)).views; // week 5
    expect(w5[1].order).toBe(9); // the wholesaler sees it in week 5
    const w7 = simulate(orders).views; // week 6 — shipped in week 5, not yet arrived
    expect(w7[0].arrived).toBe(4);
    const w8 = simulate([...orders, [4, 4, 4, 4]]).views; // week 7 — it arrives
    expect(w8[0].arrived).toBe(9);
  });

  test('what cannot be shipped becomes backlog and costs 1 per case', () => {
    // nobody ever orders anything: the shop runs dry after the step to 8
    const { history } = simulate(weeks(8, 0));
    const shop = history.map((h) => h.views[0]);
    const dry = shop.find((v) => v.backlog > 0);
    expect(dry).toBeDefined();
    expect(dry.weekCost).toBe(0.5 * dry.stock + dry.backlog);
  });

  test('after the last week there is nothing left to decide', () => {
    const { views, history } = simulate(weeks(BG_WEEKS, 8));
    expect(views).toBeNull();
    expect(history).toHaveLength(BG_WEEKS);
  });
});

describe('bgMessage', () => {
  test('a link sees its own numbers and the question for its supplier', () => {
    const { week, views } = simulate(weeks(2, 4));
    const m = bgMessage(week, 1, views[1]);
    expect(m).toContain('неделя 3');
    expect(m).toContain('ОПТОВИК');
    expect(m).toContain('Заказ от Магазина: 4');
    expect(m).toContain('Сколько заказать у Дистрибьютора?');
  });

  test('never tells anyone what customers buy — except the shop', () => {
    const { week, views } = simulate([]);
    expect(bgMessage(week, 0, views[0])).toContain('Покупатели купили');
    for (const i of [1, 2, 3]) expect(bgMessage(week, i, views[i])).not.toContain('Покупатели');
  });

  test('the brewery brews instead of ordering', () => {
    const { week, views } = simulate([]);
    const m = bgMessage(week, 3, views[3]);
    expect(m).toContain('Пришло с варки');
    expect(m).toContain('Сколько поставить в варку?');
    expect(m).not.toContain('Ваши заказы');
  });
});

describe('beerResults', () => {
  test('the benchmark played through is ratio 1 and a calm chain', () => {
    const r = beerResults(benchmarkOrders());
    expect(r.teamCost).toBe(384);
    expect(r.ratio).toBe(1);
    expect(r.maxOrderByRole[3]).toBeLessThanOrEqual(12);
  });

  test('forecasts: share who saw waves, average guessed peak', () => {
    const r = beerResults(weeks(6, 8), [
      { name: 'А', shape: 'waves', peak: 20 },
      { name: 'Б', shape: 'step', peak: 8 },
      { name: 'В', shape: 'upDown', peak: null },
      { name: 'Г', shape: null, peak: 14 },
    ]);
    expect(r.wavesShare).toBe(67);
    expect(r.avgGuessMax).toBe(14);
    expect(r.weeks).toBe(6);
    expect(r.demand).toEqual([4, 4, 4, 4, 8, 8]);
  });

  test('no forecasts → null, not NaN; no weeks → null', () => {
    const r = beerResults(weeks(3, 4));
    expect(r.wavesShare).toBeNull();
    expect(r.avgGuessMax).toBeNull();
    expect(beerResults([])).toBeNull();
  });
});
