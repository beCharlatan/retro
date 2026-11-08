/* =========================================================
   ONLINE DECLARATION: Рынок «лимонов» (lemons)
   Sellers (the smaller half) each own ONE car — its quality is
   private, sent by the bot before pricing. Buyers don't know the
   quality. Online MVP is a single-shot market: every seller names an
   ask, every buyer names a bid; bids and asks are matched greedily
   (highest bid vs lowest ask while bid ≥ ask). The offline 4-round
   negotiation stays offline-only.
   Values from src/logic/lemons.js.
========================================================= */
import { LM_MAX_PRICE, LM_P_GOOD, LM_VALUES, splitMarket } from '../../src/logic/lemons.js';
import { intValue } from './validate.js';

const money = (v) => (v == null ? '—' : `${v} ₽`);
const roleOf = (me, assignment) =>
  assignment?.sellers?.includes(me) ? 'seller' : assignment?.buyers?.includes(me) ? 'buyer' : null;

export default {
  id: 'lemons',
  name: 'Рынок «лимонов»',
  category: 'econ',
  minPlayers: 4,
  structure: 'groups',

  rules: {
    flow: ['Продавцы и покупатели', 'Качество — только у продавца', 'Цены', 'Результаты'],
    items: [
      {
        title: 'Продавцы',
        text: 'У каждого продавца одна машина — хорошая или «лимон». Качество знаете только вы (бот прислал в личку). Назовите минимальную цену продажи.',
      },
      {
        title: 'Покупатели',
        text: 'Качество машин вам неизвестно. Назовите максимум, который готовы заплатить. Сделки случаются, когда цена покупателя не ниже цены продавца.',
      },
    ],
  },

  assignment: (participants) => {
    const names = participants.map((p) => p.name);
    const { sellers, buyers } = splitMarket(names);
    // Every seller's car: good or lemon, 50/50.
    const qualities = Object.fromEntries(
      sellers.map((name) => [name, Math.random() < LM_P_GOOD ? 'good' : 'lemon']),
    );
    return { sellers, buyers, qualities };
  },

  roster: (assignment) =>
    assignment
      ? {
          kind: 'groups',
          title: 'Рынок',
          groups: [
            { label: 'Продавцы', tone: 'a', names: assignment.sellers ?? [] },
            { label: 'Покупатели', tone: 'b', names: assignment.buyers ?? [] },
          ],
        }
      : null,

  fieldsFor: (_round, ctx) => {
    const role = roleOf(ctx.me, ctx.assignment);
    if (role === 'seller') {
      return [
        {
          key: 'ask',
          kind: 'int',
          label: 'Минимальная цена вашей машины',
          hint: `хорошая стоит ${LM_VALUES.good.buyer}, «лимон» — ${LM_VALUES.lemon.buyer}; качество знаете только вы`,
          min: 0,
          max: LM_MAX_PRICE,
        },
      ];
    }
    return [
      {
        key: 'bid',
        kind: 'int',
        label: 'Максимум, который готовы заплатить за машину',
        hint: 'качество неизвестно — примерно половина машин хорошие',
        min: 0,
        max: LM_MAX_PRICE,
      },
    ];
  },

  myInfo: (_round, ctx) => {
    const role = roleOf(ctx.me, ctx.assignment);
    return role === 'seller'
      ? 'Вы ПРОДАВЕЦ: качество вашей машины — в личке у бота. Цену назовите с учётом него.'
      : 'Вы ПОКУПАТЕЛЬ: качество машин вам неизвестно. Не переплатите за «лимон».';
  },

  empty: () => ({ ask: null, bid: null }),

  flatten: (payload) => ({ ask: payload.ask ?? null, bid: payload.bid ?? null }),

  validateRound(raw, _round, ctx, _prev) {
    const role = roleOf(ctx.me, ctx.assignment);
    if (!role) return { ok: false, error: 'Вас нет на рынке' };
    const v = intValue(raw[role === 'seller' ? 'ask' : 'bid'], { min: 0, max: LM_MAX_PRICE });
    if (v === null) return { ok: false, error: 'Впишите цену' };
    return { ok: true, patch: { [role === 'seller' ? 'ask' : 'bid']: v } };
  },

  complete: (named, assignment) => {
    if (!assignment?.sellers?.length) return false;
    const byName = new Map(named.map((n) => [n.name, n.payload]));
    return (
      named.length >= 4 &&
      assignment.sellers.every((s) => byName.get(s)?.ask != null) &&
      assignment.buyers.every((b) => byName.get(b)?.bid != null)
    );
  },

  entries(named, assignment) {
    return named.map(({ tgId, name, payload }) => {
      const role = roleOf(name, assignment);
      return {
        tgId,
        name,
        tag: role === 'seller' ? 'Продавец' : role === 'buyer' ? 'Покупатель' : '',
        cells: [
          {
            label: role === 'seller' ? 'Мин. цена' : 'Макс. цена',
            value: money(role === 'seller' ? payload.ask : payload.bid),
          },
        ],
        payload,
      };
    });
  },

  compute(named, assignment) {
    const byName = new Map(named.map((n) => [n.name, n.payload]));
    const asks = (assignment?.sellers ?? [])
      .map((name) => ({ name, ask: byName.get(name)?.ask, quality: assignment.qualities?.[name] }))
      .filter((x) => x.ask != null)
      .sort((a, b) => a.ask - b.ask);
    const bids = (assignment?.buyers ?? [])
      .map((name) => ({ name, bid: byName.get(name)?.bid }))
      .filter((x) => x.bid != null)
      .sort((a, b) => b.bid - a.bid);
    // Greedy matching: cheapest asks against highest bids while they cross.
    const trades = [];
    let i = 0;
    let j = 0;
    while (i < asks.length && j < bids.length) {
      if (bids[j].bid >= asks[i].ask) {
        trades.push({
          seller: asks[i].name,
          buyer: bids[j].name,
          price: asks[i].ask,
          quality: asks[i].quality,
        });
        i += 1;
        j += 1;
      } else {
        j += 1; // this buyer can't afford the cheapest ask — try the next
      }
    }
    const surplus = trades.reduce((acc, t) => acc + (LM_VALUES[t.quality]?.buyer - t.price), 0);
    const lemonsSold = trades.filter((t) => t.quality === 'lemon').length;
    return {
      trades: trades.length,
      surplus,
      lemonsSold,
      goodSold: trades.length - lemonsSold,
    };
  },

  headline: (r) => String(r.trades),
  detail: (r) =>
    `Сделок: ${r.trades}. Из них «лимонов»: ${r.lemonsSold} — при неопределённости качества они и уходят с рынка первыми.`,
  timerSeconds: () => 40,

  // Only sellers get a private text — the quality of their own car.
  dispatchText: (name, _idx, assignment) => {
    if (roleOf(name, assignment) !== 'seller') return null;
    const quality = assignment?.qualities?.[name];
    if (!quality) return null;
    const v = LM_VALUES[quality];
    return [
      'Рынок «лимонов» · ваша машина',
      '',
      `Ваша машина — ${v.label}.`,
      `Её реальная ценность для покупателя: ${v.buyer} ₽, для вас: ${v.seller} ₽.`,
      'Качество знаете только вы. Назовите минимальную цену продажи — покупатели её не знают.',
    ].join('\n');
  },
};
