/* =========================================================
   ONLINE GAME DECLARATIONS — the server side of a game
   =========================================================
   A declaration says: how people are split (solo / pairs / groups),
   what each participant's answer form looks like per round, how to
   validate a submitted answer, and how to turn the collected answers
   into results. The math comes from the SAME pure modules the offline
   app uses (src/logic/) — one source of truth for what a game means.

   NOTE: question/wording constants are duplicated from
   src/games/<id>.js because those files are Lit components that
   register custom elements at import time and can't run on the
   server. Keep them in sync when the wording changes; Этап 3 should
   extract shared constants.

   The full contract (withDefaults in this file fills the gaps, so a
   plain solo game only needs the Этап-1 fields):

     id, name, category,
     minPlayers,
     structure        — 'solo' | 'pairs' | 'groups'        (default solo)
     rounds           — how many collect rounds             (default 1)
     roundTitles      — [title per round]                   (default 'Раунд N')
     rules            — participant-facing rules
     fields           — flat field list (solo games)
     assignment       — (participants) => assignment object (pairs/groups)
     fieldsFor        — (round, ctx) => Field[]  ctx: {me, meTgId, assignment}
     empty            — () => default payload
     validateRound    — (raw, round, ctx, prev) => {ok:true, patch} | {ok:false, error}
     flatten          — (payload) => {fieldKey: value}      (edit form + counters)
     roundFilled      — (payload, round, ctx) => bool       ('answered at all')
     complete         — (namedAnswers, assignment) => bool  (reveal gate)
     entries          — (namedAnswers, assignment) => rows [{tgId, name, cells, payload}]
     compute          — (namedAnswers, assignment) => result (JSON-safe)
     headline(result), detail(result)
     roster           — (assignment, players) => wire roster | null
     myInfo           — (round, ctx) => text | null         (participant's role card)
     dispatchText     — (name, playerIndex, assignment) => text | null
     timerSeconds     — (round) => number | null

   Answer field types:
     { key, kind: 'int', label, hint?, min?, max? }
     { key, kind: 'choice', label, options: [{ value, label }] }
========================================================= */

import anchoring from './anchoring.js';
import availability from './availability.js';
import barnum from './barnum.js';
import beautyContest from './beauty-contest.js';
import calibration from './calibration.js';
import crowdWisdom from './crowd-wisdom.js';
import dictator from './dictator.js';
import elFarol from './el-farol.js';
import endowment from './endowment.js';
import falseConsensus from './false-consensus.js';
import framing from './framing.js';
import hiddenProfile from './hidden-profile.js';
import lemons from './lemons.js';
import planningFallacy from './planning-fallacy.js';
import prisonersDilemma from './prisoners-dilemma.js';
import publicGoods from './public-goods.js';
import ultimatum from './ultimatum.js';
import volunteer from './volunteer.js';
import weakestLink from './weakest-link.js';

const RAW = [
  anchoring,
  planningFallacy,
  crowdWisdom,
  availability,
  ultimatum,
  prisonersDilemma,
  endowment,
  hiddenProfile,
  falseConsensus,
  barnum,
  calibration,
  volunteer,
  dictator,
  publicGoods,
  weakestLink,
  beautyContest,
  elFarol,
  framing,
  lemons,
];

// Fill the contract defaults so simple solo declarations (Этап 1)
// don't repeat them: single round, no assignment, validate() doubles
// as validateRound with a whole-payload patch, and filled/complete are
// derived from flatten().
function withDefaults(g) {
  const flatValues = (payload) => Object.values(g.flatten(payload));
  return {
    structure: 'solo',
    rounds: 1,
    hasDispatch: Boolean(g.dispatchText),
    anonymous: false,
    recap: null,
    ...g,
    fieldsFor: g.fieldsFor ?? (() => g.fields),
    validateRound:
      g.validateRound ??
      ((raw, _round, _ctx, _prev) => {
        const r = g.validate(raw);
        return r.ok ? { ok: true, patch: r.answers } : r;
      }),
    roundFilled: g.roundFilled ?? ((payload) => flatValues(payload).some((v) => v !== null)),
    complete:
      g.complete ??
      ((named) =>
        named.length >= g.minPlayers &&
        named.every(({ payload }) => flatValues(payload).every((v) => v !== null))),
    roundTitle: g.roundTitle ?? ((i) => g.roundTitles?.[i] ?? `Раунд ${i + 1}`),
    roster: g.roster ?? (() => null),
    myInfo: g.myInfo ?? (() => null),
    dispatchText: g.dispatchText ?? (() => null),
    timerSeconds: g.timerSeconds ?? (() => null),
  };
}

export const GAMES = RAW.map(withDefaults);

const byId = new Map(GAMES.map((g) => [g.id, g]));

export const getGame = (id) => byId.get(id) ?? null;

export const gameSummaries = () =>
  GAMES.map((g) => ({
    id: g.id,
    name: g.name,
    category: g.category,
    minPlayers: g.minPlayers,
    structure: g.structure,
    rounds: g.rounds,
  }));
