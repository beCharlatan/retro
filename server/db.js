/* =========================================================
   DB — sessions, players, answers in bun:sqlite
   =========================================================
   A session is one evening of retro: facilitator + players + one
   game at a time. State that must survive a server restart lives
   here (answers especially — a lost answer mid-game would be
   visible to everyone). The live game state machine (phase, current
   screen) lives in memory (server/session.js) and is rebuilt from
   these tables on boot.

   ids are short random codes: session id doubles as the deep-link
   parameter, so it is short and readable (no O/0/I/1).
========================================================= */
import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    facilitator_name TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS players (
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    tg_id        INTEGER NOT NULL,
    name         TEXT NOT NULL,
    username     TEXT NOT NULL DEFAULT '',
    role         TEXT NOT NULL DEFAULT 'participant', -- facilitator | participant
    joined_at    INTEGER NOT NULL,
    PRIMARY KEY (session_id, tg_id)
  );

  CREATE TABLE IF NOT EXISTS answers (
    session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    game_id      TEXT NOT NULL,
    tg_id        INTEGER NOT NULL,
    payload      TEXT NOT NULL, -- JSON, shape is per-game (declaration.parse)
    updated_at   INTEGER NOT NULL,
    PRIMARY KEY (session_id, game_id, tg_id)
  );

  CREATE INDEX IF NOT EXISTS idx_answers_session ON answers(session_id, game_id);

  CREATE TABLE IF NOT EXISTS meta (
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    game_id    TEXT NOT NULL,
    key        TEXT NOT NULL,
    value      TEXT NOT NULL,
    PRIMARY KEY (session_id, game_id, key)
  );
`);

// Migration for databases created before the profile integration:
// players grow an avatar_url column (Telegram profile photo).
const playerCols = db
  .prepare('PRAGMA table_info(players)')
  .all()
  .map((c) => c.name);
if (!playerCols.includes('avatar_url')) {
  db.exec('ALTER TABLE players ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ""');
}

// ---------- sessions ----------

export function createSession(id, facilitatorName) {
  const now = Date.now();
  db.prepare(
    'INSERT INTO sessions (id, created_at, updated_at, facilitator_name) VALUES (?, ?, ?, ?)',
  ).run(id, now, now, facilitatorName);
  return getSession(id);
}

export const getSession = (id) => db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) ?? null;

export function touchSession(id) {
  db.prepare('UPDATE sessions SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

export function gcSessions() {
  const cutoff = Date.now() - config.sessionTtlHours * 3600_000;
  db.prepare('DELETE FROM sessions WHERE updated_at < ?').run(cutoff);
}

// ---------- players ----------

export function upsertPlayer(
  sessionId,
  { tgId, name, username = '', role = 'participant', avatarUrl = '' },
) {
  db.prepare(
    `INSERT INTO players (session_id, tg_id, name, username, role, joined_at, avatar_url)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (session_id, tg_id)
     DO UPDATE SET name = excluded.name,
                   username = excluded.username,
                   avatar_url = CASE WHEN excluded.avatar_url != '' THEN excluded.avatar_url ELSE players.avatar_url END`,
  ).run(sessionId, tgId, name, username, role, Date.now(), avatarUrl);
  touchSession(sessionId);
}

export const listPlayers = (sessionId) =>
  db
    .prepare(
      'SELECT tg_id, name, username, role, joined_at, avatar_url FROM players WHERE session_id = ? ORDER BY joined_at',
    )
    .all(sessionId);

export function renamePlayerRow(sessionId, tgId, name) {
  db.prepare('UPDATE players SET name = ? WHERE session_id = ? AND tg_id = ?').run(
    name,
    sessionId,
    tgId,
  );
  touchSession(sessionId);
}

// ---------- answers ----------

export function putAnswer(sessionId, gameId, tgId, payload) {
  db.prepare(
    `INSERT INTO answers (session_id, game_id, tg_id, payload, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (session_id, game_id, tg_id)
     DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
  ).run(sessionId, gameId, tgId, JSON.stringify(payload), Date.now());
  touchSession(sessionId);
}

export const listAnswers = (sessionId, gameId) =>
  db
    .prepare('SELECT tg_id, payload FROM answers WHERE session_id = ? AND game_id = ?')
    .all(sessionId, gameId)
    .map((r) => ({ tgId: r.tg_id, payload: JSON.parse(r.payload) }));

export const clearAnswers = (sessionId, gameId) => {
  db.prepare('DELETE FROM answers WHERE session_id = ? AND game_id = ?').run(sessionId, gameId);
};

// ---------- per-game meta (assignment, round, ...) ----------
// JSON values keyed by (session, game): pair/group assignment, the
// current round index — anything losing which would change the game
// for people already in the room.

export const getMeta = (sessionId, gameId, key) => {
  const row = db
    .prepare('SELECT value FROM meta WHERE session_id = ? AND game_id = ? AND key = ?')
    .get(sessionId, gameId, key);
  return row ? JSON.parse(row.value) : null;
};

export function setMeta(sessionId, gameId, key, value) {
  db.prepare(
    `INSERT INTO meta (session_id, game_id, key, value)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (session_id, game_id, key)
     DO UPDATE SET value = excluded.value`,
  ).run(sessionId, gameId, key, JSON.stringify(value));
  touchSession(sessionId);
}

export const clearMeta = (sessionId, gameId) => {
  db.prepare('DELETE FROM meta WHERE session_id = ? AND game_id = ?').run(sessionId, gameId);
};

// A short readable id without ambiguous characters — the facilitator
// dictates it / sends the deep link, so O/0/I/1 are out.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newSessionId() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
