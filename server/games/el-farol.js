/* =========================================================
   ONLINE DECLARATION: Бар «Эль Фароль» (el-farol)
   Eight evenings; each evening everyone decides to go (or stay home).
   The bar fits 60% of the team — go when it's not crowded, lose when
   it is. Logic from src/logic/el-farol.js.
========================================================= */
import { EF_ROUNDS, efCapacity, elFarolResults, elFarolRound } from '../../src/logic/el-farol.js';
import { choiceValue } from './validate.js';

const KEYS = Array.from({ length: EF_ROUNDS }, (_, i) => `e${i + 1}`);
const GO = [
  { value: 'go', label: 'Иду' },
  { value: 'stay', label: 'Остаюсь' },
];

export default {
  id: 'el-farol',
  name: 'Бар «Эль Фароль»',
  category: 'econ',
  minPlayers: 3,
  rounds: EF_ROUNDS,
  roundTitles: KEYS.map((_, i) => `Вечер ${i + 1} · бар`),

  rules: {
    flow: ['Восемь вечеров', 'Идти или нет', 'Результаты'],
    items: [
      {
        title: 'Бар вмещает 60% команды',
        text: 'Каждый вечер решаете: идёте в бар или нет. Если пришло не больше 60% — всем пришедшим +1. Если больше — бар переполнен, пришедшие получают −1.',
      },
      {
        title: 'Тайно и одновременно',
        text: 'Выбор каждого вечера тайный. Думайте, как остальные оценят ситуацию после прошлых вечеров.',
      },
    ],
  },

  fieldsFor: (round) => [
    {
      key: KEYS[round],
      kind: 'choice',
      label: `Вечер ${round + 1}: идёте в бар?`,
      options: GO,
    },
  ],

  empty: () => Object.fromEntries(KEYS.map((k) => [k, null])),

  flatten: (payload) => Object.fromEntries(KEYS.map((k) => [k, payload[k] ?? null])),

  validateRound(raw, round) {
    const v = choiceValue(raw[KEYS[round]], GO);
    if (v === null) return { ok: false, error: 'Сделайте выбор' };
    return { ok: true, patch: { [KEYS[round]]: v } };
  },

  roundFilled: (payload, round) => payload[KEYS[round]] != null,

  complete: (named) =>
    named.length >= 3 && named.every((n) => KEYS.every((k) => n.payload[k] != null)),

  recap: (round, named) => {
    const capacity = efCapacity(named.length);
    const rows = named.map((n) => ({ name: n.name, go: KEYS.map((k) => n.payload[k] === 'go') }));
    return Array.from({ length: round }, (_, i) => {
      const s = elFarolRound(rows, i, capacity);
      return `Вечер ${i + 1}: пришло ${s.came} из ${named.length} (вмещается ${capacity}) — ${s.crowded ? 'переполнен' : 'удался'}.`;
    });
  },

  entries(named) {
    return named.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      cells: KEYS.map((k, i) => ({
        label: `В${i + 1}`,
        value: payload[k] == null ? '—' : payload[k] === 'go' ? 'И' : '—',
      })),
      payload,
    }));
  },

  compute(named) {
    const capacity = efCapacity(named.length);
    const rows = named.map((n) => ({ name: n.name, go: KEYS.map((k) => n.payload[k] === 'go') }));
    const r = elFarolResults(rows, capacity);
    const good = r.evenings.filter((e) => !e.crowded).length;
    return {
      capacity,
      good,
      total: r.evenings.length,
      attendance: r.attendance,
      goodSilent: r.goodSilent,
      goodTalk: r.goodTalk,
    };
  },

  headline: (r) => `${r.good} из ${r.total}`,
  detail: (r) =>
    `Вечеров без переполнения. Вместимость бара — ${r.capacity}. Если все мыслят одинаково, прогнозы ломаются: паб Мерфи в действии.`,
  timerSeconds: () => 15,
};
