/* =========================================================
   ONLINE DECLARATION: Эффект владения (endowment)
   Two groups; group A sells (names a minimum, WTA), group B buys
   (names a maximum, WTP) — same roles for all three lots.
   Constants duplicated from src/games/endowment.js.
========================================================= */
import { endowmentResults } from '../../src/logic/results.js';
import { Roles } from '../../src/roles.js';
import { intValue } from './validate.js';

const LOTS = [
  {
    id: 'mug',
    name: 'кружку',
    title: 'Фирменная кружка',
    hint: 'В магазинах такие кружки стоят примерно 400–800 ₽.',
  },
  {
    id: 'car',
    name: 'автомобиль',
    title: 'Автомобиль',
    hint: 'Похожие объявления стоят примерно 1,2–1,6 млн ₽.',
  },
  {
    id: 'house',
    name: 'дом за городом',
    title: 'Дом за городом',
    hint: 'Похожие объекты стоят примерно 8–12 млн ₽.',
  },
];

const money = (v) => (v == null ? '—' : `${v.toLocaleString('ru-RU')} ₽`);

const roleOf = (me, assignment) => {
  if (assignment?.groupA?.includes(me)) return 'owner';
  if (assignment?.groupB?.includes(me)) return 'buyer';
  return null;
};

export default {
  id: 'endowment',
  name: 'Эффект владения',
  category: 'cognitive',
  minPlayers: 4,
  structure: 'groups',

  rules: {
    flow: ['Две команды', 'Три лота', 'Цены', 'Результаты'],
    items: [
      {
        title: 'Две команды',
        text: 'Одна команда «владеет» вещами и продаёт, другая покупает. Своя команда известна до начала.',
      },
      { title: 'Владельцы', text: 'Для каждого лота назовите минимум, за который готовы продать.' },
      {
        title: 'Покупатели',
        text: 'Для каждого лота назовите максимум, который готовы заплатить.',
      },
    ],
  },

  assignment: (participants) => {
    const { groupA, groupB } = Roles.makeGroups(participants.map((p) => p.name));
    return { groupA, groupB };
  },

  roster: (assignment) =>
    assignment
      ? {
          kind: 'groups',
          title: 'Команды',
          groups: [
            { label: 'Владельцы (продают)', tone: 'a', names: assignment.groupA ?? [] },
            { label: 'Покупатели (покупают)', tone: 'b', names: assignment.groupB ?? [] },
          ],
        }
      : null,

  fieldsFor: (_round, ctx) => {
    const role = roleOf(ctx.me, ctx.assignment);
    const verb =
      role === 'owner' ? 'Минимум, за который продали бы' : 'Максимум, который заплатили бы';
    return LOTS.map((lot, i) => ({
      key: `price_${i}`,
      kind: 'int',
      label: `${lot.title}: ${verb} ${lot.name}`,
      hint: lot.hint,
      min: 0,
      max: 100_000_000,
    }));
  },

  myInfo: (_round, ctx) => {
    const role = roleOf(ctx.me, ctx.assignment);
    return role === 'owner'
      ? 'Ваша команда — ВЛАДЕЛЬЦЫ. Назовите минимум, за который продали бы каждый лот.'
      : 'Ваша команда — ПОКУПАТЕЛИ. Назовите максимум, который заплатили бы за каждый лот.';
  },

  empty: () => ({ prices: LOTS.map(() => null) }),

  flatten: (payload) =>
    Object.fromEntries(LOTS.map((_, i) => [`price_${i}`, payload.prices?.[i] ?? null])),

  validateRound(raw, _round, ctx, prev) {
    if (!roleOf(ctx.me, ctx.assignment)) return { ok: false, error: 'Вас нет ни в одной команде' };
    const prices = (prev?.prices ?? LOTS.map(() => null)).slice();
    for (let i = 0; i < LOTS.length; i++) {
      if (raw[`price_${i}`] !== undefined) {
        prices[i] = intValue(raw[`price_${i}`], { min: 0, max: 100_000_000 });
      }
    }
    if (prices.every((p) => p === null)) return { ok: false, error: 'Назовите хотя бы одну цену' };
    return { ok: true, patch: { prices } };
  },

  roundFilled: (payload) => (payload.prices ?? []).some((p) => p !== null),

  complete: (named) =>
    named.length >= 4 &&
    named.every(({ payload }) => (payload.prices ?? []).every((p) => p !== null)),

  entries(named, assignment) {
    return named.map(({ tgId, name, payload }) => {
      const role = roleOf(name, assignment);
      return {
        tgId,
        name,
        tag: role === 'owner' ? 'Владелец' : role === 'buyer' ? 'Покупатель' : '',
        cells: LOTS.map((lot, i) => ({ label: lot.title, value: money(payload.prices?.[i]) })),
        payload,
      };
    });
  },

  compute(named, assignment) {
    const entries = named.map(({ name, payload }) => ({
      name,
      role: roleOf(name, assignment),
      prices: payload.prices ?? [],
    }));
    const r = endowmentResults(entries, LOTS.length);
    return {
      ratio: r.ratio,
      perLot: r.perLot.map((l) => ({
        avgWTA: l.avgWTA === null ? null : Math.round(l.avgWTA),
        avgWTP: l.avgWTP === null ? null : Math.round(l.avgWTP),
        ratio: l.ratio === null ? null : Math.round(l.ratio * 10) / 10,
      })),
      filled: r.filled.length,
    };
  },

  headline: (r) => r.ratio ?? '—',
  detail: (r) =>
    'Во сколько раз средняя цена продажи больше средней цены покупки (по всем лотам). Владение делает вещь субъективно дороже.',
};
