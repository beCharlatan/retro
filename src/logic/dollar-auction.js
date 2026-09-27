/* =========================================================
   DOLLAR AUCTION (Shubik 1971)
   =========================================================
   An open ascending auction for a prize where the RUNNER-UP pays their
   last bid too and gets nothing. `bids` is the log in order:
   [{ name, amount }], each amount above the previous one.
========================================================= */

export const DA_PRIZE = 100;
export const DA_STEP = 10;
export const DA_START = 10;

// Leader, runner-up (the highest bid by anyone else), what the next bid would be.
export function auctionState(bids) {
  const leader = bids.at(-1) ?? null;
  const runnerUp = leader
    ? ([...bids].reverse().find((b) => b.name !== leader.name) ?? null)
    : null;
  const top = leader?.amount ?? 0;
  const second = runnerUp?.amount ?? 0;
  return {
    leader,
    runnerUp,
    nextBid: leader ? top + DA_STEP : DA_START,
    revenue: top + second,
    profit: top + second - DA_PRIZE,
  };
}

export function auctionResults(bids) {
  if (!bids.length) return null;
  const s = auctionState(bids);
  const final = s.leader.amount;
  const second = s.runnerUp?.amount ?? 0;
  // the first moment the two top bids together were worth more than the prize
  let profitAt = null;
  for (let i = 1; i < bids.length && profitAt === null; i++) {
    const st = auctionState(bids.slice(0, i + 1));
    if (st.revenue > DA_PRIZE) profitAt = i;
  }
  const absurdAt = bids.findIndex((b) => b.amount >= DA_PRIZE);
  const series = bids.map((_, i) => auctionState(bids.slice(0, i + 1)));
  return {
    final,
    second,
    winner: s.leader.name,
    runnerUp: s.runnerUp?.name ?? null,
    revenue: s.revenue,
    profit: s.profit,
    bids: bids.length,
    profitAt,
    absurdAt: absurdAt === -1 ? null : absurdAt,
    bidsAfterAbsurd: absurdAt === -1 ? 0 : bids.length - 1 - absurdAt,
    leaderSeries: series.map((st) => st.leader.amount),
    revenueSeries: series.map((st) => st.revenue),
  };
}
