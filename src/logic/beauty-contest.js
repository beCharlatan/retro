/* =========================================================
   GUESS 2/3 OF THE AVERAGE (Nagel 1995; Keynes's beauty contest)
   =========================================================
   Everyone names a whole number 0–100; whoever is closest to ⅔ of the
   mean wins (ties: all the closest). Four rounds.
   Rows: { name, guesses: [r1…r4] } with null for not entered yet.
========================================================= */
import { mean } from './stats.js';

export const BC_ROUNDS = 4;
export const BC_P = 2 / 3;
export const BC_MAX = 100;
// Steps of reasoning: level 0 says 50, each next level takes ⅔ of the one before.
export const BC_LEVELS = [
  { level: 0, value: 50 },
  { level: 1, value: 33 },
  { level: 2, value: 22 },
  { level: 3, value: 15 },
  { level: 4, value: 10 },
];
export const BC_IMPOSSIBLE = 67; // above ⅔ of the highest possible mean nothing can win

const round1 = (v) => Math.round(v * 10) / 10;

export function beautyRound(rows, round) {
  const entries = rows
    .map((r) => ({ name: r.name, guess: r.guesses[round] }))
    .filter((e) => e.guess !== null && e.guess !== undefined);
  if (!entries.length) return null;
  const avg = mean(entries.map((e) => e.guess));
  const target = avg * BC_P;
  const best = Math.min(...entries.map((e) => Math.abs(e.guess - target)));
  return {
    n: entries.length,
    mean: round1(avg),
    target: round1(target),
    winners: entries.filter((e) => Math.abs(Math.abs(e.guess - target) - best) < 1e-9),
    entries,
  };
}

// Which step of reasoning a guess looks like: the nearest level within ±3, else null.
export function reasoningLevel(guess) {
  if (guess === 0) return 'zero';
  if (guess > BC_IMPOSSIBLE) return 'impossible';
  const near = BC_LEVELS.find((l) => Math.abs(guess - l.value) <= 3);
  return near ? near.level : null;
}

export function beautyResults(rows) {
  const rounds = Array.from({ length: BC_ROUNDS }, (_, i) => beautyRound(rows, i));
  if (!rounds[0]) return null;
  const firstGuesses = rounds[0].entries.map((e) => e.guess);
  const count = (fn) => firstGuesses.filter(fn).length;
  return {
    rounds,
    targetByRound: rounds.map((r) => r?.target ?? null),
    meanByRound: rounds.map((r) => r?.mean ?? null),
    levelsR1: {
      l0: count((g) => reasoningLevel(g) === 0),
      l1: count((g) => reasoningLevel(g) === 1),
      l2: count((g) => reasoningLevel(g) === 2),
      l3plus: count((g) => [3, 4].includes(reasoningLevel(g))),
      zero: count((g) => g === 0),
      impossible: count((g) => g > BC_IMPOSSIBLE),
    },
    zeroCount: rows.filter((r) => r.guesses.some((g) => g === 0)).length,
    wins: new Map(
      rows.map((r) => [
        r.name,
        rounds.filter((x) => x?.winners.some((w) => w.name === r.name)).length,
      ]),
    ),
  };
}
