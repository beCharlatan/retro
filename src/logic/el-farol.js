/* =========================================================
   EL FAROL BAR (Arthur 1994)
   =========================================================
   Every evening everyone secretly decides: go or stay home. The bar is
   fun only if at most 60% of the team come. Going to a good evening
   pays +1, going into a crowd −1, staying home 0. Eight evenings; from
   the fifth on the team may talk and agree on anything (nothing binds).
   Rows: { name, go: [e1…e8] } — true (идёт) | false (дома).
========================================================= */
import { mean } from './stats.js';

export const EF_ROUNDS = 8;
export const EF_TALK_FROM = 5; // 1-based: talking allowed from this evening on
export const EF_SHARE = 0.6;

export const efCapacity = (players) => Math.max(1, Math.floor(players * EF_SHARE));

export const efPayoff = (went, crowded) => (went ? (crowded ? -1 : 1) : 0);

export function elFarolRound(rows, round, capacity) {
  const came = rows.filter((r) => r.go[round]).length;
  return { came, crowded: came > capacity };
}

export function elFarolResults(rows, capacity, played = EF_ROUNDS) {
  const evenings = Array.from({ length: played }, (_, i) => elFarolRound(rows, i, capacity));
  const talkIdx = EF_TALK_FROM - 1;
  const half = (from, to) => evenings.slice(from, to);
  const good = (xs) => xs.filter((e) => !e.crowded).length;
  // how far attendance strayed from the number of seats, on average
  const spread = (xs) => (xs.length ? mean(xs.map((e) => Math.abs(e.came - capacity))) : null);
  return {
    capacity,
    attendance: evenings.map((e) => e.came),
    evenings,
    goodSilent: good(half(0, talkIdx)),
    goodTalk: good(half(talkIdx, played)),
    silentCount: Math.min(talkIdx, played),
    talkCount: Math.max(0, played - talkIdx),
    spreadSilent: spread(half(0, talkIdx)),
    spreadTalk: spread(half(talkIdx, played)),
    people: rows.map((r) => ({
      name: r.name,
      visits: r.go.slice(0, played).filter(Boolean).length,
      points: evenings.reduce((acc, e, i) => acc + efPayoff(r.go[i], e.crowded), 0),
    })),
  };
}
