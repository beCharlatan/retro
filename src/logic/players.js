/* =========================================================
   PLAYERS — the team list, as pure functions
   =========================================================
   The list of people who play is data the facilitator manages in the app (the panel on
   the home map), not something written into the code. Everything here takes a list and
   returns a NEW one, never mutates, and never throws on bad input:

     player   { name: string, active: boolean }   — `active: false` means "not playing today"
              (kept in the list so they needn't be typed in again next time)

   Names identify people inside the games (rows are keyed by name, a pair is two names), so
   they are trimmed, single-spaced, at most MAX_NAME long and unique regardless of case.
========================================================= */

export const MAX_NAME = 30;
export const MAX_PLAYERS = 60;
export const MIN_PLAYERS = 2; // the smallest team any game can be played with (a pair)

// What "Заполнить примером" fills in — an example to try the app with, nothing more.
export const SAMPLE_PLAYERS = [
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
  'Анатолий',
];

export const cleanName = (raw) =>
  String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim();
export const sameName = (a, b) => a.toLocaleLowerCase('ru') === b.toLocaleLowerCase('ru');

export const makePlayers = (names) => names.map((name) => ({ name, active: true }));
export const activeNames = (players) => players.filter((p) => p.active).map((p) => p.name);
export const allNames = (players) => players.map((p) => p.name);

// Why a name can't be used — or null. `except` is the index being renamed (it may keep its own name).
export function nameError(raw, players, except = -1) {
  const name = cleanName(raw);
  if (!name) return 'empty';
  if (name.length > MAX_NAME) return 'long';
  if (players.some((p, i) => i !== except && sameName(p.name, name))) return 'duplicate';
  if (except < 0 && players.length >= MAX_PLAYERS) return 'full';
  return null;
}

export const ERROR_TEXT = {
  empty: 'Введите имя',
  long: `Имя длиннее ${MAX_NAME} символов`,
  duplicate: 'Такой игрок уже есть',
  full: `Не больше ${MAX_PLAYERS} игроков`,
};

// → { players, error }  (error is a key of ERROR_TEXT, or null; on error `players` is unchanged)
export function addPlayer(players, raw) {
  const error = nameError(raw, players);
  if (error) return { players, error };
  return { players: [...players, { name: cleanName(raw), active: true }], error: null };
}

export function renamePlayer(players, index, raw) {
  if (!players[index]) return { players, error: 'empty' };
  const error = nameError(raw, players, index);
  if (error) return { players, error };
  return {
    players: players.map((p, i) => (i === index ? { ...p, name: cleanName(raw) } : p)),
    error: null,
  };
}

export const removePlayer = (players, index) => players.filter((_, i) => i !== index);

export const setActive = (players, index, active) =>
  players.map((p, i) => (i === index ? { ...p, active: !!active } : p));

export const setAllActive = (players, active) => players.map((p) => ({ ...p, active: !!active }));

// "Анна, Борис\nВера;Глеб" → ['Анна', 'Борис', 'Вера', 'Глеб']; blanks and repeats are dropped.
export function parseNames(text) {
  const seen = [];
  for (const piece of String(text ?? '').split(/[\n\r,;\t]+/)) {
    const name = cleanName(piece);
    if (name && name.length <= MAX_NAME && !seen.some((n) => sameName(n, name))) seen.push(name);
  }
  return seen;
}

// Adds every name that fits; counts what was added and what was left out (already there / full).
export function addMany(players, names) {
  let next = players;
  let added = 0;
  let skipped = 0;
  for (const name of names) {
    const r = addPlayer(next, name);
    if (r.error) skipped++;
    else {
      next = r.players;
      added++;
    }
  }
  return { players: next, added, skipped };
}

// ---- storage format ----
export const serializePlayers = (players) => JSON.stringify(players);

// A stored value → a valid list, or null if it isn't one. Bad entries are dropped, not repaired.
export function deserializePlayers(json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;
  let list = [];
  for (const item of raw) {
    if (!item || typeof item.name !== 'string') continue;
    const r = addPlayer(list, item.name);
    if (!r.error)
      list = r.players.map((p, i) =>
        i === r.players.length - 1 ? { ...p, active: item.active !== false } : p,
      );
  }
  return list;
}

// Can a game be started with this team? → null, or the reason.
export function teamProblem(players) {
  const n = activeNames(players).length;
  if (n < MIN_PLAYERS) {
    return n === 0
      ? 'Добавьте игроков, чтобы начать'
      : `Нужно хотя бы ${MIN_PLAYERS} игрока — сейчас ${n}`;
  }
  return null;
}
