/* =========================================================
   HIDDEN PROFILE (Stasser & Titus 1985) — the dossiers
   =========================================================
   Hiring: three finalists. Every card holds all SHARED facts plus its own
   UNIQUE ones. By any single card Саша looks best; by all facts together
   Женя is clearly best:

               shared          unique (per card)     one card     all cards
     Женя      3 minus         2 plus × 4 cards      +2 / −3      +8 / −3
     Саша      4 plus          1 minus × 4 cards     +4 / −1      +4 / −4
     Валя      3 plus, 2 minus —                     +3 / −2      +3 / −2

   The names are gender-neutral and no fact uses the past tense, so nothing
   gives away a candidate's gender — keep it that way when editing.
   Cards are dealt 1–4 in turn (the 5th person gets card 1 again).
========================================================= */

export const HP_CANDIDATES = [
  { id: 'sasha', name: 'Саша' },
  { id: 'zhenya', name: 'Женя' },
  { id: 'valya', name: 'Валя' },
];
export const HP_BEST = 'zhenya';
export const HP_CARD_COUNT = 4;

// sign: +1 plus, −1 minus (shown only in the reveal table, never in the dossiers)
export const HP_SHARED = {
  zhenya: [
    { sign: -1, text: 'Основной опыт в Kotlin, с Go (наш стек) — только пет-проекты.' },
    { sign: -1, text: 'Зарплатные ожидания на 10% выше верхней границы вилки.' },
    {
      sign: -1,
      text: 'Задача на live-coding решена, но с превышением отведённого времени на 15 минут.',
    },
  ],
  sasha: [
    { sign: 1, text: 'Пять лет коммерческой разработки на Go — ровно наш стек.' },
    {
      sign: 1,
      text: 'На собеседовании — отличное впечатление: уверенная речь, быстрые чёткие ответы.',
    },
    { sign: 1, text: 'Зарплатные ожидания в середине вилки.' },
    { sign: 1, text: 'Сертификат AWS Solutions Architect Professional.' },
  ],
  valya: [
    { sign: 1, text: 'Три года на Go.' },
    { sign: 1, text: 'Тестовое задание выполнено аккуратно, с тестами.' },
    { sign: 1, text: 'Опыт эксплуатации Kubernetes в продакшене.' },
    { sign: -1, text: 'Нет опыта наставничества и технического лидерства.' },
    { sign: -1, text: 'Выход на работу — не раньше чем через 2 месяца.' },
  ],
};

export const HP_CARDS = [
  {
    title: 'Отзывы с прошлых мест',
    zhenya: [
      'По отзыву техлида прошлой компании — самый надёжный человек в команде во время инцидентов.',
      'В рекомендациях трое бывших коллег независимо называют Женю лучшим наставником в отделе.',
    ],
    sasha: 'Бывший руководитель: за последний год сорваны все три ключевых дедлайна.',
  },
  {
    title: 'Техническое интервью',
    zhenya: [
      'На системном дизайне — лучший результат среди всех кандидатов за год (оценка интервьюера).',
      'Автор внутренней системы код-ревью, которую переняли 12 команд компании.',
    ],
    sasha: 'Тестовое задание: тестов нет, два требования из пяти не выполнены.',
  },
  {
    title: 'Опыт и проекты',
    zhenya: [
      'Руководство переводом легаси-монолита на сервисы — от начала до конца, без крупных инцидентов.',
      'Контрибьютор в open-source библиотеку, которую наша команда использует в проде.',
    ],
    sasha: 'Трое бывших коллег независимо жалуются на резкий и пренебрежительный тон в код-ревью.',
  },
  {
    title: 'HR-скрининг',
    zhenya: [
      'Ведёт сервис платежей под нагрузкой 40 тыс. запросов в секунду; аптайм 99,99% за два года.',
      'Свободный английский — важно для работы с зарубежным заказчиком.',
    ],
    sasha: 'Четыре места работы за последние три года, нигде дольше 9 месяцев.',
  },
];

// All eight unique pluses of Женя, in card order — the "what surfaced" checklist.
export const HP_UNIQUE_PLUSES = HP_CARDS.flatMap((c, card) =>
  c.zhenya.map((text) => ({ card, text })),
);

export const hpCardFor = (personIdx) => personIdx % HP_CARD_COUNT;

// A card's facts per candidate, the unique ones mixed in. The order is fixed per
// card (a rotation by the card number), so everyone holding one card reads the same.
export function hpCardFacts(card) {
  const rotate = (xs, k) => xs.map((_, i) => xs[(i + k) % xs.length]);
  const c = HP_CARDS[card];
  return {
    sasha: rotate([...HP_SHARED.sasha.map((f) => f.text), c.sasha], card + 1),
    zhenya: rotate([...HP_SHARED.zhenya.map((f) => f.text), ...c.zhenya], card * 2 + 1),
    valya: rotate(
      HP_SHARED.valya.map((f) => f.text),
      card,
    ),
  };
}

// The private message for one person (plain text for a messenger).
export function hpMessage(card, minutes) {
  const facts = hpCardFacts(card);
  const block = (id) =>
    `${HP_CANDIDATES.find((c) => c.id === id).name.toUpperCase()}\n${facts[id].map((t) => `• ${t}`).join('\n')}`;
  return [
    `Скрытый профиль · досье №${card + 1} «${HP_CARDS[card].title}»`,
    '',
    'Нанимаем старшего разработчика. Финалисты: Саша, Женя, Валя.',
    'Ваша часть досье:',
    '',
    block('sasha'),
    '',
    block('zhenya'),
    '',
    block('valya'),
    '',
    `У вас ${minutes} минуты. Потом закройте этот чат и напишите мне, кого бы вы взяли: Саша, Женя или Валя.`,
  ].join('\n');
}

// rows: { name, card, vote: 'sasha'|'zhenya'|'valya'|null }
export function hiddenProfileResults(rows, groupChoice, surfaced) {
  const voted = rows.filter((r) => r.vote);
  if (!voted.length && !groupChoice) return null;
  const soloVotes = Object.fromEntries(
    HP_CANDIDATES.map((c) => [c.id, voted.filter((r) => r.vote === c.id).length]),
  );
  return {
    soloVotes,
    total: voted.length,
    groupChoice,
    surfaced: surfaced ?? null,
    foundBest: groupChoice === HP_BEST,
  };
}
