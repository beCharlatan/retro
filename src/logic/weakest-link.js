/* =========================================================
   WEAKEST LINK — the minimum-effort game (Van Huyck, Battalio & Beil 1990)
   =========================================================
   Everyone picks an effort 1–7; the team's result is set by the SMALLEST
   effort. Payoff = 60 + 20·min − 10·own (the original's dollars ×100):
   all-7 pays 130 each, effort 1 guarantees 70, a lone 7 next to a 1 gets 10.
   Rows: { name, efforts: [r1…r5] } with null for not entered yet.
========================================================= */
import { mean, percent } from './stats.js';

export const EFFORTS = [1, 2, 3, 4, 5, 6, 7];
export const WL_ROUNDS = 5;
export const WL_TALK_ROUND = 4; // the minute of talk happens right before this round (1-based)

export const wlPayoff = (own, min) => 60 + 20 * min - 10 * own;

// One round: who entered, the minimum, how many chose each effort.
export function weakestLinkRound(rows, round) {
  const efforts = rows.map((r) => r.efforts[round]).filter((v) => v !== null && v !== undefined);
  if (!efforts.length) return null;
  const min = Math.min(...efforts);
  const counts = EFFORTS.map((e) => efforts.filter((v) => v === e).length);
  return {
    n: efforts.length,
    min,
    counts,
    share7: percent(counts[6], efforts.length),
    avgEffort: mean(efforts),
    avgPayoff: mean(efforts.map((e) => wlPayoff(e, min))),
  };
}

export function weakestLinkResults(rows) {
  const rounds = Array.from({ length: WL_ROUNDS }, (_, i) => weakestLinkRound(rows, i));
  const played = rounds.filter(Boolean);
  if (!played.length) return null;
  const minByRound = rounds.map((r) => r?.min ?? null);
  const talkIdx = WL_TALK_ROUND - 1;
  const talkEffect =
    minByRound[talkIdx] !== null && minByRound[talkIdx - 1] !== null
      ? minByRound[talkIdx] - minByRound[talkIdx - 1]
      : null;
  const people = rows.map((r) => ({
    name: r.name,
    efforts: r.efforts,
    total: r.efforts.reduce(
      (acc, e, i) => (e === null || !rounds[i] ? acc : acc + wlPayoff(e, rounds[i].min)),
      0,
    ),
  }));
  return {
    rounds,
    minByRound,
    share7ByRound: rounds.map((r) => r?.share7 ?? null),
    avgEffortByRound: rounds.map((r) => (r ? Math.round(r.avgEffort * 10) / 10 : null)),
    talkEffect,
    people,
  };
}
