/* =========================================================
   PLATFORM STATE
   =========================================================
   Shared, app-wide data + the avatar/name rendering helpers built on
   top of it (every game and the home screen use these — one place to
   keep a person's color consistent everywhere: home screen, every
   game's forms and results tables, and the printed PDF).
========================================================= */
export const state = {
  participants: [
    'Михаил',
    'Виктория',
    'Ирина',
    'Айшат',
    'Екатерина',
    'Олег',
    'Мухамед',
    'Артём',
    'Марат',
    'Арина',
    'Таня',
    'Денис',
    'Диана',
  ],
  // Home screen filters. Deliberately shared, persistent module state
  // (like `participants`) rather than a Lit reactive property local to
  // `<retro-home>` — a facilitator filtering to one category, opening
  // a game, then returning home should still see that same filter
  // applied, not have it silently reset just because going "back"
  // remounts a fresh <retro-home> element. See src/home.js.
  filter: 'all',
  structureFilter: 'all',
};

export const CATEGORY = {
  cognitive: {
    label: 'Когнитивные искажения',
    color: 'var(--blue-deep)',
    pillBg: 'var(--blue-soft)',
  },
  econ: {
    label: 'Экономика / теория игр',
    color: 'var(--orange-deep)',
    pillBg: 'var(--orange-soft)',
  },
  social: {
    label: 'Социальная психология',
    color: 'var(--purple-deep)',
    pillBg: 'var(--purple-soft)',
  },
};

// How participants are split for the exercise — used by the second filter row.
export const STRUCTURE = {
  solo: { label: 'Каждый сам за себя' },
  pairs: { label: 'По парам' },
  groups: { label: '2 команды' },
};

// A cheerful, distinct color per participant — looked up by each
// person's position in state.participants, so the same person keeps
// the same color everywhere.
export const AVATAR_COLORS = [
  '#3E6E64',
  '#B5502E',
  '#B7862C',
  '#7A4364',
  '#3B6E8F',
  '#5C7A3A',
  '#9C4B3B',
  '#6B5B95',
  '#4F8F7A',
  '#A16A2E',
  '#5B4B8A',
  '#8A4B6B',
];

export const AVATAR_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.7 0 8 1.34 8 4v2H4v-2c0-2.66 5.3-4 8-4zm0-2a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg>`;

export function avatarColor(name) {
  const idx = state.participants.indexOf(name);
  return AVATAR_COLORS[(idx < 0 ? 0 : idx) % AVATAR_COLORS.length];
}

// Renders a small colored avatar for `name`. Pass size:'sm' for the
// compact version used inline in entry forms, role cards and results
// tables — the default (no size) is the larger chip-sized version
// used on the home screen's participant panel.
export function avatarHTML(name, size) {
  const color = avatarColor(name);
  const cls = size === 'sm' ? 'avatar avatar-sm' : 'avatar';
  return `<span class="${cls}" style="background:${color}">${AVATAR_SVG}</span>`;
}

// Wraps a name with its (small) avatar as one inline unit — the form
// used almost everywhere outside the home screen's own chip markup:
// entry rows, pair/team cards, role screens and results tables.
export function avatarName(name) {
  return `<span class="name-with-avatar">${avatarHTML(name, 'sm')}${name}</span>`;
}

export const GAMES = [
  {
    id: 'anchoring',
    icon: '⚓',
    name: 'Эффект якоря',
    category: 'cognitive',
    teaser: 'Случайное число незаметно сдвигает вашу же числовую оценку.',
    players: '4+',
    time: '5 мин',
    ready: true,
    structure: 'solo',
  },
  {
    id: 'crowd-wisdom',
    icon: '🐂',
    name: 'Мудрость толпы',
    category: 'cognitive',
    teaser: 'Средняя оценка группы обходит по точности почти всех поодиночке.',
    players: '4+',
    time: '5 мин',
    ready: true,
    structure: 'solo',
  },
  {
    id: 'ultimatum',
    icon: '⚖️',
    name: 'Ультиматум',
    category: 'econ',
    teaser: 'Люди отвергают выгодные предложения, если те кажутся нечестными.',
    players: '4+ (чётное)',
    time: '10 мин',
    ready: true,
    structure: 'pairs',
  },
  {
    id: 'dictator',
    icon: '👑',
    name: 'Игра диктатора',
    category: 'econ',
    teaser: 'Никто не заставляет делиться — но почти все делятся.',
    players: '3+',
    time: '7 мин',
    ready: true,
    structure: 'solo',
  },
  {
    id: 'public-goods',
    icon: '🪙',
    name: 'Общественное благо',
    category: 'econ',
    teaser: 'Группе выгодно вкладываться всем — каждому по отдельности выгоднее не вкладываться.',
    players: '4+',
    time: '10 мин',
    ready: true,
    structure: 'solo',
  },
  {
    id: 'false-consensus',
    icon: '🙋',
    name: 'Ложный консенсус',
    category: 'social',
    teaser: 'Мы уверены, что наше мнение разделяют куда больше людей, чем на самом деле.',
    players: '5+',
    time: '6 мин',
    ready: true,
    structure: 'solo',
  },
  {
    id: 'endowment',
    icon: '☕',
    name: 'Эффект владения',
    category: 'cognitive',
    teaser: 'Та же вещь внезапно дороже для того, кто ей уже владеет.',
    players: '4+ (чётное)',
    time: '9 мин',
    ready: true,
    structure: 'groups',
  },
  {
    id: 'barnum',
    icon: '🔮',
    name: 'Эффект Барнума',
    category: 'social',
    teaser: 'Расплывчатое описание личности кажется удивительно «прямо про меня».',
    players: '3+',
    time: '6 мин',
    ready: true,
    structure: 'solo',
  },
  {
    id: 'prisoners-dilemma',
    icon: '🔒',
    name: 'Дилемма заключённого',
    category: 'econ',
    teaser: 'Рационально предать — но если встреча не последняя, правила меняются.',
    players: '4+ (чётное)',
    time: '10 мин',
    ready: true,
    structure: 'pairs',
  },
  {
    id: 'framing',
    icon: '🖼️',
    name: 'Эффект фрейминга',
    category: 'cognitive',
    teaser:
      'Один и тот же выбор выглядит разумным или рискованным — в зависимости от формулировки.',
    players: '6+ (чётное)',
    time: '7 мин',
    ready: true,
    structure: 'groups',
  },
  {
    id: 'availability',
    icon: '⚡',
    name: 'Эвристика доступности',
    category: 'cognitive',
    teaser: 'Мы оцениваем риск по тому, что легче вспоминается, а не по статистике.',
    players: '4+',
    time: '6 мин',
    ready: true,
    structure: 'solo',
  },
  {
    id: 'planning-fallacy',
    icon: '⏳',
    name: 'Ошибка планирования',
    category: 'cognitive',
    teaser: '«В лучшем случае» и «по факту» — почти никогда не одно и то же число.',
    players: '4+',
    time: '6 мин',
    ready: true,
    structure: 'solo',
  },
  {
    id: 'calibration',
    icon: '🎯',
    name: 'Калибровка уверенности',
    category: 'cognitive',
    teaser: 'Уверены на 90%? Реальное попадание обычно куда ниже.',
    players: '4+',
    time: '10 мин',
    ready: true,
    structure: 'solo',
  },
];

// The single mount point every screen (home + all 13 games) renders
// into via `app.innerHTML = ...`. Looked up once, at module load —
// safe because the built page's <div id="app"> exists before this
// module (a `type="module"` script, implicitly deferred) ever runs.
export const app = document.getElementById('app');
