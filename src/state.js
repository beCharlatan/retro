/* =========================================================
   PLATFORM STATE
   =========================================================
   Shared, app-wide data + the avatar/name rendering helpers built on
   top of it (every game and the home screen use these — one place to
   keep a person's color consistent everywhere: home screen, every
   game's forms and results tables, and the exported PNG report).
========================================================= */
import { avatarInitial, pickAvatarColor } from './logic/format.js';

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

// color/pillBg точно повторяют Choice-токен кита для своего оттенка:
// pillBg — фон Light2, color — заданный в ките (не производный)
// тёмный текст поверх именно этого фона. См. --*-on-light2 в styles.css.
export const CATEGORY = {
  cognitive: {
    label: 'Когнитивные искажения',
    color: 'var(--blue-on-light2)',
    pillBg: 'var(--blue-soft)',
  },
  econ: {
    label: 'Экономика / теория игр',
    color: 'var(--orange-on-light2)',
    pillBg: 'var(--orange-soft)',
  },
  social: {
    label: 'Социальная психология',
    color: 'var(--purple-on-light2)',
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

export function avatarColor(name) {
  return pickAvatarColor(name, state.participants, AVATAR_COLORS);
}

// Renders a small colored avatar for `name`. Pass size:'sm' for the
// compact version used inline in entry forms, role cards and results
// tables — the default (no size) is the larger chip-sized version
// used on the home screen's participant panel.
export function avatarHTML(name, size) {
  const color = avatarColor(name);
  const cls = size === 'sm' ? 'avatar avatar-sm' : 'avatar';
  return `<span class="${cls}" style="background:${color}">${avatarInitial(name)}</span>`;
}

// Wraps a name with its (small) avatar as one inline unit — the form
// used almost everywhere outside the home screen's own chip markup:
// entry rows, pair/team cards, role screens and results tables.
export function avatarName(name) {
  return `<span class="name-with-avatar">${avatarHTML(name, 'sm')}${name}</span>`;
}

// `icon` — a key into ICONS (src/icon-assets.js): decorative 3D-render
// glyphs, assigned per game arbitrarily (no thematic meaning intended,
// unlike the previous per-game emoji) — see docs/modernization-plan.md.
export const GAMES = [
  {
    id: 'anchoring',
    icon: 'helix',
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
    icon: 'spheres',
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
    icon: 'cube-1',
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
    icon: 'icosahedron',
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
    icon: 'torus-knot',
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
    icon: 'pill',
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
    icon: 'cylinder-1',
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
    icon: 'sphere',
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
    icon: 'pyramid-1',
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
    icon: 'cube-2',
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
    icon: 'torus-1',
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
    icon: 'flat-cylinder',
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
    icon: 'pyramid-2',
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
