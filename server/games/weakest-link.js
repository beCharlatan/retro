/* =========================================================
   ONLINE DECLARATION: Слабое звено (weakest-link)
   Five rounds; each round everyone picks an effort 1–7. The team's
   result is the MINIMUM effort (a chain is as strong as its weakest
   link). Logic from src/logic/weakest-link.js.
========================================================= */
import {
  EFFORTS,
  WL_ROUNDS,
  weakestLinkResults,
  weakestLinkRound,
} from '../../src/logic/weakest-link.js';
import { intValue } from './validate.js';

const roundN = (i) => `Раунд ${i + 1} · усилие`;
const KEYS = Array.from({ length: WL_ROUNDS }, (_, i) => `r${i + 1}`);

export default {
  id: 'weakest-link',
  name: 'Слабое звено',
  category: 'social',
  minPlayers: 3,
  rounds: WL_ROUNDS,
  roundTitles: KEYS.map((_, i) => roundN(i)),

  rules: {
    flow: ['Пять раундов', 'Усилие 1–7', 'Результаты'],
    items: [
      {
        title: 'Усилие 1–7',
        text: 'Каждый раунд тайно выбираете, сколько вложиться: 1 — почти ничего, 7 — по полной.',
      },
      {
        title: 'Слабое звено',
        text: 'Результат ВСЕЙ команды равен МИНИМАЛЬНОМУ вложению. Один «1» — и раунд провален, кто бы ни старался.',
      },
      {
        title: 'Обсуждение',
        text: 'Перед четвёртым раундом ведущий даст минуту на разговор — пользуйтесь.',
      },
    ],
  },

  fieldsFor: (round) => [
    {
      key: KEYS[round],
      kind: 'int',
      label: `Раунд ${round + 1}: сколько вложитесь? (1–7)`,
      hint: '1 — ничего, 7 — по полной; минимум по команде определит раунд',
      min: 1,
      max: 7,
    },
  ],

  myInfo: () => 'Ваш выбор тайный до конца раунда.',

  empty: () => Object.fromEntries(KEYS.map((k) => [k, null])),

  flatten: (payload) => Object.fromEntries(KEYS.map((k) => [k, payload[k] ?? null])),

  validateRound(raw, round) {
    const v = intValue(raw[KEYS[round]], { min: 1, max: 7 });
    if (v === null) return { ok: false, error: 'Впишите число от 1 до 7' };
    return { ok: true, patch: { [KEYS[round]]: v } };
  },

  roundFilled: (payload, round) => payload[KEYS[round]] != null,

  complete: (named) =>
    named.length >= 3 && named.every((n) => KEYS.every((k) => n.payload[k] != null)),

  recap: (round, named) => {
    const rows = named.map((n) => ({ name: n.name, efforts: KEYS.map((k) => n.payload[k]) }));
    return Array.from({ length: round }, (_, i) => {
      const s = weakestLinkRound(rows, i);
      return s
        ? `Раунд ${i + 1}: минимум ${s.min}, среднее ${s.avgEffort.toFixed(1)}, семёрки поставили ${s.share7}%.`
        : `Раунд ${i + 1}: —`;
    });
  },

  entries(named) {
    return named.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      cells: KEYS.map((k, i) => ({
        label: `Р${i + 1}`,
        value: payload[k] == null ? '—' : String(payload[k]),
      })),
      payload,
    }));
  },

  compute(named) {
    const rows = named.map((n) => ({ name: n.name, efforts: KEYS.map((k) => n.payload[k]) }));
    const r = weakestLinkResults(rows);
    if (!r) return { avg: null, talkEffect: null };
    const played = r.avgEffortByRound.filter((x) => x !== null);
    return {
      avg: played.length ? played.reduce((a, b) => a + b, 0) / played.length : null,
      minByRound: r.minByRound,
      talkEffect: r.talkEffect,
      filled: r.people.length,
    };
  },

  headline: (r) => (r.avg === null ? '—' : r.avg.toFixed(1)),
  detail: (r) =>
    r.talkEffect === null
      ? 'Среднее усилие по команде за раунды. Минимум каждого раунда решал больше, чем среднее.'
      : `Среднее усилие по команде. После минуты разговора минимальный раунд ${r.talkEffect >= 0 ? 'вырос' : 'упал'} на ${Math.abs(r.talkEffect)}.`,
  timerSeconds: () => 20,
};
