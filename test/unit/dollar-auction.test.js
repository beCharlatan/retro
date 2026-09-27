// test/unit/dollar-auction.test.js
// The dollar auction (src/logic/dollar-auction.js): who leads, who is the
// runner-up that pays for nothing, and the two moments the results screen
// points at — when the auctioneer went into profit and when bids passed the prize.
import { describe, expect, test } from 'bun:test';
import {
  auctionResults,
  auctionState,
  DA_PRIZE,
  DA_START,
  DA_STEP,
} from '../../src/logic/dollar-auction.js';

const bids = (...pairs) => pairs.map(([name, amount]) => ({ name, amount }));

describe('auctionState', () => {
  test('before any bid: the opening bid is the start', () => {
    const s = auctionState([]);
    expect(s.leader).toBeNull();
    expect(s.nextBid).toBe(DA_START);
  });

  test('the runner-up is the best bid by someone OTHER than the leader', () => {
    const s = auctionState(bids(['А', 10], ['Б', 20], ['В', 30], ['Б', 40]));
    expect(s.leader).toEqual({ name: 'Б', amount: 40 });
    expect(s.runnerUp).toEqual({ name: 'В', amount: 30 });
    expect(s.nextBid).toBe(40 + DA_STEP);
    expect(s.revenue).toBe(70);
    expect(s.profit).toBe(70 - DA_PRIZE);
  });
});

describe('auctionResults', () => {
  // А and Б escalate 10, 20, … 160
  const war = bids(...Array.from({ length: 16 }, (_, i) => [i % 2 ? 'Б' : 'А', (i + 1) * 10]));

  test('final, second and what the two paid together', () => {
    const r = auctionResults(war);
    expect(r.final).toBe(160);
    expect(r.second).toBe(150);
    expect(r.winner).toBe('Б');
    expect(r.runnerUp).toBe('А');
    expect(r.revenue).toBe(310);
    expect(r.profit).toBe(210);
  });

  test('the auctioneer is in profit from 50 + 60, the prize is passed at the 10th bid', () => {
    const r = auctionResults(war);
    expect(r.profitAt).toBe(5); // 0-based: the bid of 60, with 50 behind it
    expect(r.absurdAt).toBe(9); // the bid of 100
    expect(r.bidsAfterAbsurd).toBe(6);
  });

  test('a short auction never reaches those points', () => {
    const r = auctionResults(bids(['А', 10], ['Б', 20]));
    expect(r.profitAt).toBeNull();
    expect(r.absurdAt).toBeNull();
    expect(r.bidsAfterAbsurd).toBe(0);
  });

  test('a single bid: nobody else pays', () => {
    const r = auctionResults(bids(['А', 10]));
    expect(r.second).toBe(0);
    expect(r.runnerUp).toBeNull();
  });

  test('no bids → null', () => {
    expect(auctionResults([])).toBeNull();
  });
});
