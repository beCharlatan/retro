/* =========================================================
   ONLINE DECLARATION: Скрытый профиль (hidden-profile)
   The whole team hires one of three finalists. Every participant
   gets a private dossier card via the bot (раздача в личку);
   then everyone votes. Math and texts come from
   src/logic/hidden-profile.js unchanged.
========================================================= */
import {
  HP_BEST,
  HP_CANDIDATES,
  hiddenProfileResults,
  hpCardFor,
  hpMessage,
} from '../../src/logic/hidden-profile.js';
import { choiceValue } from './validate.js';

const READ_MINUTES = 3;
const nameOf = (id) => HP_CANDIDATES.find((c) => c.id === id)?.name ?? '—';

export default {
  id: 'hidden-profile',
  name: 'Скрытый профиль',
  category: 'social',
  minPlayers: 3,
  structure: 'team',

  rules: {
    flow: ['Досье в личке', 'Обсуждение', 'Голос', 'Результаты'],
    items: [
      {
        title: 'Досье',
        text: `Каждому в личном чате бота приходит своя часть досье трёх финалистов. Читайте ${READ_MINUTES} минуты — показывать другим нельзя.`,
      },
      {
        title: 'Обсуждение',
        text: 'Обсудите вслух, кого берёте. Всё ли важное вы знаете о каждом кандидате?',
      },
      { title: 'Голос', text: 'Тайно проголосуйте за одного из троих: Саша, Женя или Валя.' },
    ],
  },

  fields: [
    {
      key: 'vote',
      kind: 'choice',
      label: 'Кого бы вы взяли на позицию старшего разработчика?',
      options: HP_CANDIDATES.map((c) => ({ value: c.id, label: c.name })),
    },
  ],

  myInfo: () =>
    'Ваша часть досье уже в вашем личном чате с ботом — прочитайте её до обсуждения. Показывать другим нельзя.',

  empty: () => ({ vote: null }),

  flatten: (payload) => ({ vote: payload.vote ?? null }),

  validate(raw) {
    const vote = choiceValue(
      raw.vote,
      HP_CANDIDATES.map((c) => ({ value: c.id })),
    );
    if (vote === null) return { ok: false, error: 'Выберите кандидата' };
    return { ok: true, answers: { vote } };
  },

  complete: (named) => named.length >= 3 && named.every(({ payload }) => payload.vote != null),

  entries(named) {
    return named.map(({ tgId, name, payload }) => ({
      tgId,
      name,
      cells: [{ label: 'Голос', value: payload.vote == null ? '—' : nameOf(payload.vote) }],
      payload,
    }));
  },

  compute(named) {
    const rows = named.map((n, i) => ({ name: n.name, card: hpCardFor(i), vote: n.payload.vote }));
    const r = hiddenProfileResults(rows, null, null);
    // Reduce needs an id (not a candidate object) as the seed, or a
    // sweep where nobody beats the first candidate returns the object.
    const winner = HP_CANDIDATES.reduce(
      (best, c) => ((r.soloVotes[c.id] ?? 0) > (r.soloVotes[best] ?? 0) ? c.id : best),
      HP_CANDIDATES[0].id,
    );
    return {
      soloVotes: r.soloVotes,
      total: r.total,
      best: HP_BEST,
      winner: r.total ? winner : null,
      foundBest: r.total > 0 && winner === HP_BEST,
    };
  },

  headline: (r) => (r.winner ? nameOf(r.winner) : '—'),
  detail: (r) => {
    const tally = HP_CANDIDATES.map((c) => `${c.name}: ${r.soloVotes[c.id] ?? 0}`).join(' · ');
    const verdict = r.foundBest
      ? 'Команда выбрала лучшего кандидата.'
      : `По всем фактам сильнее всего ${nameOf(r.best)} — но обсуждение часто выбирает не лучшего.`;
    return `${tally}. ${verdict}`;
  },

  // The dossier lands in the participant's Telegram DM — the offline
  // hpMessage is reused verbatim (it is already plain text for a
  // messenger).
  dispatchText: (_name, playerIndex) => hpMessage(hpCardFor(playerIndex), READ_MINUTES),
};
