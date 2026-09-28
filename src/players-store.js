/* =========================================================
   PLAYERS STORE — where the team list lives while the app runs
   =========================================================
   The list is managed in the UI (players-admin.js) and remembered in localStorage, so it is the
   same next time the file is opened; nothing about it is written into the code. It feeds the
   rest of the app through `state`:

     state.players        every person in the list: [{ name, active }]
     state.participants   the names of those playing today (active ones), in order — what the
                          games read. Updated IN PLACE, so code holding the array stays current.

   Where the browser won't give localStorage (private mode, some file:// setups) the list still
   works for the session; `playersArePersisted()` tells the UI so it can say the list won't be kept.
========================================================= */
import { activeNames, deserializePlayers, serializePlayers } from './logic/players.js';
import { state } from './state.js';

export const STORAGE_KEY = 'retro.players.v1';

const listeners = new Set();
let persisted = true;

function storage() {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function read() {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    return raw ? deserializePlayers(raw) : null;
  } catch {
    return null;
  }
}

function write(players) {
  try {
    const s = storage();
    if (!s) throw new Error('no storage');
    s.setItem(STORAGE_KEY, serializePlayers(players));
    persisted = true;
  } catch {
    persisted = false;
  }
}

function apply(players) {
  state.players = players;
  state.participants.splice(0, state.participants.length, ...activeNames(players));
}

export const playersArePersisted = () => persisted;

// Replaces the whole list (already validated by logic/players.js), remembers it, tells listeners.
export function setPlayers(players) {
  apply(players);
  write(players);
  for (const fn of listeners) fn(state.players);
}

// Runs `change(players) → { players, ...rest }` (any logic/players.js function) and stores the result.
export function updatePlayers(change) {
  const result = change(state.players);
  if (result.players !== state.players) setPlayers(result.players);
  return result;
}

export function onPlayersChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// First load: whatever was stored (if anything). An empty list is a real state — nobody is added
// for you; the panel offers an example instead.
const stored = read();
if (stored) apply(stored);
else persisted = storage() !== null;
