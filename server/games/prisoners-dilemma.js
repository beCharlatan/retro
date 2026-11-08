/* =========================================================
   ONLINE DECLARATION: Дилемма заключённого (prisoners-dilemma)
   Pairs, two rounds; every round both choose: cooperate or defect.
   Constants duplicated from src/games/prisoners-dilemma.js.
========================================================= */
import { prisonersDilemmaResults } from '../../src/logic/results.js';
import { Roles } from '../../src/roles.js';
import { choiceValue } from './validate.js';

const CHOICES = [
  { value: 'C', label: 'Сотрудничать' },
  { value: 'D', label: 'Предать' },
];
const mark = (c) => (c == null ? '—' : c === 'C' ? 'Сотр.' : 'Предал');

const pairOf = (me, assignment) => assignment?.pairs?.find((p) => p.a === me || p.b === me) ?? null;

export default {
  id: 'prisoners-dilemma',
  name: 'Дилемма заключённого',
  category: 'econ',
  minPlayers: 2,
  structure: 'pairs',
  rounds: 2,
  roundTitles: ['Раунд 1 · первый контакт', 'Раунд 2 · реванш'],

  rules: {
    flow: ['Пары', 'Два раунда', 'Выбор', 'Результаты'],
    items: [
      {
        title: 'Пары',
        text: 'Ведущий разобьёт вас на пары. Вы играете с одним партнёром два раунда подряд.',
      },
      {
        title: 'Выбор',
        text: 'Каждый раунд — тайный выбор: сотрудничать или предать. Партнёр узнает ваш выбор после раунда.',
      },
      {
        title: 'Очки',
        text: 'Оба сотрудничают — по 3 очка. Оба предают — по 1. Предатель получает 5, «козёл отпущения» — 0.',
      },
    ],
  },

  assignment: (participants) => {
    const { pairs, trio } = Roles.makePairs(participants.map((p) => p.name));
    return { pairs, trio };
  },

  roster: (assignment) =>
    assignment
      ? {
          kind: 'pairs',
          title: 'Пары',
          pairs: assignment.pairs.map((p) => ({ a: p.a, b: p.b, trio: p.trio === true })),
        }
      : null,

  fieldsFor: (round, ctx) =>
    pairOf(ctx.me, ctx.assignment)
      ? [
          {
            key: `r${round + 1}_choice`,
            kind: 'choice',
            label: `Раунд ${round + 1}: ваш ход против ${partnerName(ctx.me, ctx.assignment)}`,
            options: CHOICES,
          },
        ]
      : [],

  myInfo: (round, ctx) => {
    const pair = pairOf(ctx.me, ctx.assignment);
    if (!pair) return null;
    return `Пара: ${ctx.me} ↔ ${partnerName(ctx.me, ctx.assignment)}. Выбор тайный до конца раунда.`;
  },

  empty: () => ({}),

  flatten: (payload) => ({
    r1_choice: payload.r1_choice ?? null,
    r2_choice: payload.r2_choice ?? null,
  }),

  validateRound(raw, round, ctx, _prev) {
    if (!pairOf(ctx.me, ctx.assignment)) return { ok: false, error: 'Вас нет ни в одной паре' };
    const key = `r${round + 1}_choice`;
    const v = choiceValue(raw[key], CHOICES);
    if (v === null) return { ok: false, error: 'Выберите ход' };
    return { ok: true, patch: { [key]: v } };
  },

  roundFilled: (payload, round) => payload[`r${round + 1}_choice`] != null,

  complete(named, assignment) {
    if (!assignment?.pairs?.length) return false;
    const byName = new Map(named.map((n) => [n.name, n.payload]));
    return assignment.pairs.every((p) => {
      const a = byName.get(p.a);
      const b = byName.get(p.b);
      return (
        a &&
        b &&
        a.r1_choice != null &&
        a.r2_choice != null &&
        b.r1_choice != null &&
        b.r2_choice != null
      );
    });
  },

  entries(named, assignment) {
    const byName = new Map(named.map((n) => [n.name, n]));
    return (assignment?.pairs ?? []).map((p) => {
      const a = byName.get(p.a);
      const b = byName.get(p.b);
      return {
        tgId: a?.tgId ?? b?.tgId ?? 0,
        name: `${p.a} ↔ ${p.b}${p.trio ? ' (трио)' : ''}`,
        cells: [
          { label: 'Р1: ' + p.a, value: mark(a?.payload.r1_choice) },
          { label: 'Р1: ' + p.b, value: mark(b?.payload.r1_choice) },
          { label: 'Р2: ' + p.a, value: mark(a?.payload.r2_choice) },
          { label: 'Р2: ' + p.b, value: mark(b?.payload.r2_choice) },
        ],
        payload: { ...(a?.payload ?? {}), ...(b?.payload ?? {}) },
      };
    });
  },

  compute(named, assignment) {
    const byName = new Map(named.map((n) => [n.name, n.payload]));
    const entries = (assignment?.pairs ?? []).flatMap((p) => {
      const a = byName.get(p.a);
      const b = byName.get(p.b);
      if (!a || !b) return [];
      return [
        {
          a: p.a,
          b: p.b,
          r1a: a.r1_choice ?? null,
          r1b: b.r1_choice ?? null,
          r2a: a.r2_choice ?? null,
          r2b: b.r2_choice ?? null,
        },
      ];
    });
    const r = prisonersDilemmaResults(entries);
    return {
      coopR1: r.coopR1,
      coopR2: r.coopR2,
      delta: r.delta,
      echoRate: r.echoRate,
      ccCount: r.ccCount,
    };
  },

  headline: (r) =>
    r.coopR2 === null ? '—' : `Сотрудничество: ${Math.round(r.coopR1)}% → ${Math.round(r.coopR2)}%`,
  detail: (r) =>
    `Доля сотрудничества во втором раунде против первого. «Око за око» (повторили ход партнёра): ${r.echoRate ?? '—'}%.`,
  timerSeconds: (round) => 30,
};

function partnerName(me, assignment) {
  const pair = pairOf(me, assignment);
  if (!pair) return '—';
  return pair.a === me ? pair.b : pair.a;
}
