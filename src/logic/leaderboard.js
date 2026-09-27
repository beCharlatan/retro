/* =========================================================
   LEADERBOARD — who scored what, for games where every person earns points
   =========================================================
   rankScores() sorts people by score (highest first) and gives tied people
   the same place ("1, 2, 2, 4"); names break ties in the ORDER only, so the
   board is stable. The per-game helpers turn a game's own data into
   [{ name, score }] where the game's results don't already carry it.
========================================================= */
import { isDeal, prisonersDilemmaPayoff } from './results.js';

// rows: [{ name, score, detail? }] → the same rows, sorted, each with `place`
export function rankScores(rows) {
  const sorted = rows
    .filter((r) => Number.isFinite(r.score))
    .slice()
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ru'));
  let place = 0;
  return sorted.map((r, i) => {
    if (i === 0 || r.score !== sorted[i - 1].score) place = i + 1;
    return { ...r, place };
  });
}

// Дилемма заключённого: everyone's points over both rounds (a trio member plays
// two matches and gets both).
export function prisonersDilemmaScores(filled) {
  const total = new Map();
  const add = (name, pts) => total.set(name, (total.get(name) ?? 0) + pts);
  for (const e of filled) {
    for (const round of [1, 2]) {
      const [a, b] = prisonersDilemmaPayoff(e[`r${round}a`], e[`r${round}b`]);
      add(e.a, a);
      add(e.b, b);
    }
  }
  return [...total].map(([name, score]) => ({ name, score }));
}

// Ультиматум: a deal gives the proposer stake − offer and the responder the offer;
// no deal, both get nothing.
export function ultimatumScores(instances, stake) {
  const total = new Map();
  const add = (name, v) => total.set(name, (total.get(name) ?? 0) + v);
  for (const x of instances) {
    const deal = isDeal(x);
    add(x.proposer, deal ? stake - x.offer : 0);
    add(x.responder, deal ? x.offer : 0);
  }
  return [...total].map(([name, score]) => ({ name, score }));
}

// Долларовый аукцион: the winner gets the prize minus the bid, the runner-up pays
// for nothing, everyone else stays at 0.
export function auctionScores(names, { winner, final, runnerUp, second }, prize) {
  return names.map((name) => ({
    name,
    score: name === winner ? prize - final : name === runnerUp ? -second : 0,
  }));
}
