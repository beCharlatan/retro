/* =========================================================
   VOLUNTEER'S DILEMMA (Diekmann 1985) + the bystander effect
   =========================================================
   Three rounds, each in bigger groups: pairs → fours → the whole team.
   In a group, if at least one person volunteers everyone gets BENEFIT
   and the volunteer pays COST; if nobody does, everyone gets 0.
   Rows: { name, choices: [r1, r2, r3] } — 'V' (беру) | 'N' (не беру) | null.
   `groupsByRound[r]` is an array of groups (arrays of names).
========================================================= */
import { mean, percent } from './stats.js';

export const VD_BENEFIT = 100;
export const VD_COST = 40;
export const VD_ROUNDS = 3;
export const VD_GROUP_SIZES = [2, 4, Infinity]; // Infinity = the whole team

// k = how many groups of about `size` fit; names are dealt round-robin so
// leftovers join existing groups (5 people in pairs → 3 + 2).
export function splitIntoGroups(names, size) {
  if (!Number.isFinite(size) || names.length < size * 2) return [names.slice()];
  const k = Math.floor(names.length / size);
  const groups = Array.from({ length: k }, () => []);
  names.forEach((n, i) => {
    groups[i % k].push(n);
  });
  return groups;
}

export const vdPayoff = (choice, anyVolunteer) =>
  anyVolunteer ? (choice === 'V' ? VD_BENEFIT - VD_COST : VD_BENEFIT) : 0;

// Mixed-strategy equilibrium for a group of n: each volunteers with
// 1 − (C/B)^(1/(n−1)); nobody does with (C/B)^(n/(n−1)).
export function vdTheory(n, cost = VD_COST, benefit = VD_BENEFIT) {
  if (n < 2) return { volunteer: 1, nobody: 0 };
  const q = cost / benefit;
  return { volunteer: 1 - q ** (1 / (n - 1)), nobody: q ** (n / (n - 1)) };
}

export function volunteerRound(rows, groups, round) {
  const choiceOf = new Map(rows.map((r) => [r.name, r.choices[round]]));
  const outcomes = groups.map((names) => {
    const choices = names.map((n) => choiceOf.get(n)).filter((c) => c === 'V' || c === 'N');
    const volunteers = choices.filter((c) => c === 'V').length;
    return {
      names,
      size: names.length,
      answered: choices.length,
      volunteers,
      saved: volunteers > 0,
    };
  });
  const answered = rows.map((r) => r.choices[round]).filter((c) => c === 'V' || c === 'N');
  if (!answered.length) return null;
  const decided = outcomes.filter((g) => g.answered > 0);
  return {
    groups: outcomes,
    avgSize: mean(groups.map((g) => g.length)),
    volunteerRate: percent(answered.filter((c) => c === 'V').length, answered.length),
    nobodyRate: percent(decided.filter((g) => !g.saved).length, decided.length),
    theory: {
      volunteer: Math.round(mean(groups.map((g) => vdTheory(g.length).volunteer)) * 100),
      nobody: Math.round(mean(groups.map((g) => vdTheory(g.length).nobody)) * 100),
    },
  };
}

export function volunteerResults(rows, groupsByRound) {
  const rounds = groupsByRound.map((groups, i) => volunteerRound(rows, groups, i));
  if (!rounds.some(Boolean)) return null;
  const savedIn = (round, name) =>
    rounds[round]?.groups.find((g) => g.names.includes(name))?.saved ?? false;
  const people = rows.map((r) => ({
    name: r.name,
    choices: r.choices,
    total: r.choices.reduce(
      (acc, c, i) => (c === 'V' || c === 'N' ? acc + vdPayoff(c, savedIn(i, r.name)) : acc),
      0,
    ),
  }));
  return { rounds, people };
}
