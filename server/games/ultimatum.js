/* =========================================================
   ONLINE DECLARATION: Ультиматум (ultimatum)
   Pairs, two rounds; round 1 — A proposes to B, round 2 — they swap.
   Constants duplicated from src/games/ultimatum.js.
========================================================= */
import { ultimatumResults } from '../../src/logic/results.js';
import { Roles } from '../../src/roles.js';
import { intValue, num } from './validate.js';

const STAKE = 1000;

const pairOf = (me, assignment) => assignment?.pairs?.find((p) => p.a === me || p.b === me) ?? null;

const isProposer = (me, pair, round) => (pair.a === me) === (round === 0);

function roundKey(me, assignment, round) {
  const pair = pairOf(me, assignment);
  if (!pair) return null;
  return isProposer(me, pair, round) ? `r${round + 1}_offer` : `r${round + 1}_min`;
}

const partnerOf = (me, pair) => (pair.a === me ? pair.b : pair.a);

export default {
  id: 'ultimatum',
  name: 'Ультиматум',
  category: 'econ',
  minPlayers: 2,
  structure: 'pairs',
  rounds: 2,
  roundTitles: ['Раунд 1 · предложение', 'Раунд 2 · меняемся ролями'],

  rules: {
    flow: ['Пары', 'Предложение и минимум', 'Смена ролей', 'Результаты'],
    items: [
      {
        title: 'Пары',
        text: 'Ведущий разобьёт вас на пары. Кто предлагает, кто отвечает — объявят перед раундом.',
      },
      {
        title: 'Предлагаете',
        text: `Назовите, сколько из ${STAKE} ₽ вы предлагаете партнёру. Партнёр заранее пишет минимум, при котором согласится.`,
      },
      {
        title: 'Отвечаете',
        text: `Назовите минимум из ${STAKE} ₽, при котором сделка для вас состоится. Предложение партнёра его не изменит.`,
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

  fieldsFor(round, ctx) {
    const pair = pairOf(ctx.me, ctx.assignment);
    if (!pair) return [];
    if (isProposer(ctx.me, pair, round)) {
      return [
        {
          key: `r${round + 1}_offer`,
          kind: 'int',
          label: `Ваше предложение для ${partnerOf(ctx.me, pair)} — сколько из ${STAKE} ₽ вы отдаёте`,
          hint: `от 0 до ${STAKE}`,
          min: 0,
          max: STAKE,
        },
      ];
    }
    return [
      {
        key: `r${round + 1}_min`,
        kind: 'int',
        label: `Ваш минимум — сколько из ${STAKE} ₽ вы готовы принять от ${partnerOf(ctx.me, pair)}`,
        hint: `от 0 до ${STAKE}; предложение партнёра его не меняет`,
        min: 0,
        max: STAKE,
      },
    ];
  },

  myInfo(round, ctx) {
    const pair = pairOf(ctx.me, ctx.assignment);
    if (!pair) return null;
    const role = isProposer(ctx.me, pair, round) ? 'вы предлагаете' : 'вы отвечаете';
    return `Пара: ${ctx.me} ↔ ${partnerOf(ctx.me, pair)} — ${role}.`;
  },

  empty: () => ({}),

  flatten: (payload) => ({
    r1_offer: payload.r1_offer ?? null,
    r1_min: payload.r1_min ?? null,
    r2_offer: payload.r2_offer ?? null,
    r2_min: payload.r2_min ?? null,
  }),

  validateRound(raw, round, ctx, _prev) {
    const key = roundKey(ctx.me, ctx.assignment, round);
    if (!key) return { ok: false, error: 'Вас нет ни в одной паре' };
    const v = intValue(raw[key], { min: 0, max: STAKE });
    if (v === null) return { ok: false, error: 'Впишите число' };
    return { ok: true, patch: { [key]: v } };
  },

  roundFilled: (payload, round, ctx) => {
    const key = roundKey(ctx.me, ctx.assignment, round);
    return key ? payload[key] !== null && payload[key] !== undefined : false;
  },

  // Every pair has all four values: r1 offer+min and r2 offer+min.
  complete(named, assignment) {
    if (!assignment?.pairs?.length) return false;
    const byName = new Map(named.map((n) => [n.name, n.payload]));
    return assignment.pairs.every((p) => {
      const a = byName.get(p.a);
      const b = byName.get(p.b);
      return (
        a && b && a.r1_offer != null && b.r1_min != null && b.r2_offer != null && a.r2_min != null
      );
    });
  },

  entries(named, assignment) {
    const byName = new Map(named.map((n) => [n.name, n]));
    return (assignment?.pairs ?? []).map((p) => {
      const a = byName.get(p.a);
      const b = byName.get(p.b);
      const cell = (v) => (v == null ? '—' : `${num(v)} ₽`);
      return {
        tgId: a?.tgId ?? b?.tgId ?? 0,
        name: `${p.a} ↔ ${p.b}${p.trio ? ' (трио)' : ''}`,
        cells: [
          { label: 'Предл. 1', value: cell(a?.payload.r1_offer) },
          { label: 'Мин. 1', value: cell(b?.payload.r1_min) },
          { label: 'Предл. 2', value: cell(b?.payload.r2_offer) },
          { label: 'Мин. 2', value: cell(a?.payload.r2_min) },
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
          r1_offer: a.r1_offer ?? null,
          r1_min: b.r1_min ?? null,
          r2_offer: b.r2_offer ?? null,
          r2_min: a.r2_min ?? null,
        },
      ];
    });
    const r = ultimatumResults(entries);
    return {
      dealRate: r.dealRate,
      avgOffer: r.avgOffer,
      avgMin: r.avgMin,
      deals: r.deals,
      instances: r.instances.length,
    };
  },

  headline: (r) => r.dealRate,
  detail: (r) =>
    `Среднее предложение ${Math.round(r.avgOffer ?? 0)} ₽, средний минимум ${Math.round(r.avgMin ?? 0)} ₽ из ${STAKE} ₽. Сделки: ${r.deals} из ${r.instances}.`,
  timerSeconds: (round) => 60,
};
