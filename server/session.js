/* =========================================================
   SESSION — one evening of retro, the state machine
   =========================================================
   Phases: lobby (players gather, facilitator picks a game) →
   collect (participants answer round by round; multi-round games
   advance with `advance`; the facilitator watches entries come in
   and can top rows up in single-round games) → results (server-
   computed, everyone sees them).

   Pair/group games get an ASSIGNMENT (who is paired with whom /
   which team) built by the game's declaration when it starts; it
   lives in the meta table so a restart can't silently reshuffle
   people mid-evening.

   Live state lives in memory; anything losing it would be felt in
   the room (answers, assignment, who joined) is mirrored to SQLite
   (db.js) and restored on boot. A round TIMER is advisory: the
   server stores the deadline, everyone counts down from it, and at
   zero a 'done' tick is broadcast — it never locks answers.
========================================================= */
import { joinDeepLink } from './config.js';
import {
  clearAnswers,
  clearMeta,
  createSession as dbCreateSession,
  getSession as dbGetSession,
  gcSessions,
  getMeta,
  listAnswers,
  listPlayers,
  newSessionId,
  putAnswer,
  renamePlayerRow,
  setMeta,
  upsertPlayer,
} from './db.js';
import { getGame } from './games/index.js';

export class Session {
  constructor(id, facilitatorName) {
    this.id = id;
    this.phase = 'lobby'; // lobby | collect | results
    this.gameId = null;
    this.players = []; // [{ tgId, name, username, role }]
    this.answers = []; // [{ tgId, payload }]
    this.results = null;
    this.round = 0;
    this.assignment = null; // pairs/groups, per game
    this.timerEndsAt = null; // ms epoch, advisory countdown
    this.joinLink = joinDeepLink(id);
    dbCreateSession(id, facilitatorName);
  }

  get game() {
    return this.gameId ? getGame(this.gameId) : null;
  }

  player(tgId) {
    return this.players.find((p) => p.tgId === tgId) ?? null;
  }

  // A display name no one else in the room has (offline app requires
  // unique names; online they come from Telegram and can collide).
  uniqueName(base, tgId) {
    let name = base.trim().slice(0, 40) || 'Без имени';
    if (this.players.some((p) => p.name === name && p.tgId !== tgId)) {
      const other = this.player(tgId);
      const suffix = other?.username ? `@${other.username}` : `#${String(tgId).slice(-4)}`;
      name = `${name} (${suffix})`.slice(0, 40);
    }
    return name;
  }

  addPlayer(user, role) {
    const name = this.uniqueName(user.name, user.tgId);
    upsertPlayer(this.id, {
      tgId: user.tgId,
      name,
      username: user.username,
      role,
      avatarUrl: user.avatarUrl ?? '',
    });
    const existing = this.player(user.tgId);
    if (existing) {
      existing.name = name;
      existing.role = role;
      if (user.avatarUrl) existing.avatarUrl = user.avatarUrl;
    } else {
      this.players.push({
        tgId: user.tgId,
        name,
        username: user.username,
        avatarUrl: user.avatarUrl ?? '',
        role,
      });
    }
  }

  // A participant renames themselves for this session (the default is
  // their Telegram profile name); the facilitator can rename anyone.
  renamePlayer(tgId, rawName) {
    const player = this.player(tgId);
    if (!player) return { ok: false, error: 'Такого участника нет в сессии' };
    const cleaned = String(rawName ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 30);
    if (!cleaned) return { ok: false, error: 'Имя не может быть пустым' };
    const name = this.uniqueName(cleaned, tgId);
    player.name = name;
    renamePlayerRow(this.id, tgId, name);
    return { ok: true, name };
  }

  participants() {
    return this.players.filter((p) => p.role === 'participant');
  }

  startGame(gameId) {
    const game = getGame(gameId);
    if (!game) return { ok: false, error: 'Неизвестная игра' };
    if (this.participants().length < game.minPlayers) {
      return { ok: false, error: `Для «${game.name}» нужно минимум ${game.minPlayers} участника` };
    }
    this.gameId = gameId;
    this.phase = 'collect';
    this.results = null;
    this.round = getMeta(this.id, gameId, 'round') ?? 0;
    this.assignment = getMeta(this.id, gameId, 'assignment');
    if (game.assignment && !this.assignment) {
      this.assignment = game.assignment(
        this.participants().map((p) => ({ tgId: p.tgId, name: p.name })),
      );
      setMeta(this.id, gameId, 'assignment', this.assignment);
    }
    this.answers = listAnswers(this.id, gameId);
    this.timerEndsAt = null;
    return { ok: true };
  }

  // The current round's answer from a participant (merge target).
  answerOf(tgId) {
    return this.answers.find((a) => a.tgId === tgId) ?? null;
  }

  submitAnswer(tgId, raw) {
    const game = this.game;
    if (!game || this.phase !== 'collect') return { ok: false, error: 'Сейчас нельзя ответить' };
    const me = this.player(tgId);
    if (!me) return { ok: false, error: 'Вас нет в сессии' };
    const prev = this.answerOf(tgId)?.payload ?? game.empty();
    const check = game.validateRound(raw, this.round, this.ctxFor(me), prev);
    if (!check.ok) return check;
    const payload = { ...prev, ...check.patch };
    putAnswer(this.id, this.gameId, tgId, payload);
    const row = this.answerOf(tgId);
    if (row) row.payload = payload;
    else this.answers.push({ tgId, payload });
    return { ok: true };
  }

  // Manual top-up — only for single-round games; with rounds a wrong
  // row is fixed by asking the person to re-answer (the edit form
  // can't know which round a value belongs to).
  facilitatorEdit(tgId, raw) {
    const game = this.game;
    if (!game || this.phase !== 'collect') return { ok: false, error: 'Сейчас нельзя править' };
    if (game.rounds > 1)
      return { ok: false, error: 'В многораундовой игре проще попросить переответить' };
    if (!this.player(tgId)) return { ok: false, error: 'Такого участника нет в сессии' };
    const prev = this.answerOf(tgId)?.payload ?? game.empty();
    const me = this.player(tgId);
    const check = game.validateRound(raw, 0, this.ctxFor(me), prev);
    if (!check.ok) return check;
    const payload = { ...prev, ...check.patch };
    putAnswer(this.id, this.gameId, tgId, payload);
    const row = this.answerOf(tgId);
    if (row) row.payload = payload;
    else this.answers.push({ tgId, payload });
    return { ok: true };
  }

  // Who am I in this game — my name and (for pairs/groups) my slot in
  // the assignment. Passed to declarations so they can shape fields.
  ctxFor(player) {
    return { me: player.name, meTgId: player.tgId, assignment: this.assignment };
  }

  advance() {
    const game = this.game;
    if (!game || this.phase !== 'collect')
      return { ok: false, error: 'Сейчас нельзя перейти дальше' };
    if (this.round >= game.rounds - 1) return { ok: false, error: 'Это последний раунд' };
    this.round += 1;
    setMeta(this.id, this.gameId, 'round', this.round);
    this.timerEndsAt = null;
    return { ok: true };
  }

  // Advisory round countdown — facilitator starts it, everyone sees
  // the same deadline, nothing is locked at zero.
  startTimer() {
    const game = this.game;
    if (!game || this.phase !== 'collect')
      return { ok: false, error: 'Сейчас нельзя запустить таймер' };
    const seconds = game.timerSeconds?.(this.round);
    if (!seconds) return { ok: false, error: 'У этого раунда нет таймера' };
    this.timerEndsAt = Date.now() + seconds * 1000;
    return { ok: true, seconds };
  }

  timerState() {
    if (!this.timerEndsAt) return null;
    const remaining = Math.max(0, Math.ceil((this.timerEndsAt - Date.now()) / 1000));
    return {
      remaining,
      duration: this.game.timerSeconds(this.round),
      state: remaining > 0 ? 'running' : 'done',
    };
  }

  // Private "раздача в личку": the declaration builds one text per
  // participant, sender delivers it (the bot in production; the
  // facilitator's screen in dev). Returns the items either way so the
  // facilitator sees exactly what went out.
  async dispatch(sender) {
    const game = this.game;
    if (!game?.dispatchText) return { ok: false, error: 'В этой игре нечего раздавать' };
    if (this.phase !== 'collect') return { ok: false, error: 'Раздача — до показа результатов' };
    const people = this.participants();
    const items = [];
    for (let i = 0; i < people.length; i++) {
      const text = game.dispatchText(people[i].name, i, this.assignment);
      if (!text) continue;
      let delivered = false;
      if (sender) delivered = Boolean(await sender(people[i].tgId, text));
      items.push({ tgId: people[i].tgId, name: people[i].name, text, delivered });
    }
    if (!items.length) return { ok: false, error: 'Не для кого раздавать' };
    return { ok: true, items };
  }

  reveal() {
    const game = this.game;
    if (!game || this.phase !== 'collect') return { ok: false, error: 'Нечего показывать' };
    const named = this.namedAnswers();
    if (named.length < game.minPlayers) {
      return {
        ok: false,
        error: `Ответили только ${named.length} — нужно минимум ${game.minPlayers}`,
      };
    }
    if (!game.complete(named, this.assignment)) {
      return { ok: false, error: 'Ещё не все заполнили свои поля' };
    }
    this.results = game.compute(named, this.assignment);
    this.phase = 'results';
    this.timerEndsAt = null;
    return { ok: true };
  }

  back() {
    if (this.phase !== 'results')
      return { ok: false, error: 'Назад можно только с экрана результатов' };
    this.phase = 'collect';
    return { ok: true };
  }

  // Back to the game picker. Answers and assignment stay in the DB
  // (keyed by game), so re-entering offers them back.
  toLobby() {
    this.phase = 'lobby';
    this.gameId = null;
    this.results = null;
    this.round = 0;
    this.assignment = null;
    this.timerEndsAt = null;
    return { ok: true };
  }

  restart() {
    if (!this.gameId) return { ok: false, error: 'Игра не выбрана' };
    clearAnswers(this.id, this.gameId);
    this.answers = [];
    this.results = null;
    this.round = 0;
    setMeta(this.id, this.gameId, 'round', 0);
    this.timerEndsAt = null;
    this.phase = 'collect';
    return { ok: true };
  }

  // Answers joined with player names — what compute/entries consume.
  namedAnswers() {
    return this.answers
      .map((a) => ({ tgId: a.tgId, name: this.player(a.tgId)?.name ?? '???', payload: a.payload }))
      .filter((a) => a.name !== '???');
  }

  answeredCount() {
    const game = this.game;
    if (!game) return 0;
    // Count people whose CURRENT round fields are all filled — that's
    // the number the facilitator and projector watch grow.
    return this.namedAnswers().filter((a) =>
      game.roundFilled(a.payload, this.round, this.ctxFor({ name: a.name, tgId: a.tgId })),
    ).length;
  }
}

// ---------- the manager: registry + persistence restore ----------

const sessions = new Map();

export function createSession(facilitator) {
  const session = new Session(newSessionId(), facilitator.name);
  session.addPlayer(facilitator, 'facilitator');
  sessions.set(session.id, session);
  gcSessions();
  return session;
}

export function joinSession(sessionId, user) {
  const session = sessions.get(sessionId) ?? restoreSession(sessionId);
  if (!session) return null;
  if (session.players.length >= 40) return null;
  session.addPlayer(user, session.player(user.tgId)?.role ?? 'participant');
  return session;
}

export const getSession = (id) => sessions.get(id) ?? restoreSession(id);

// Rebuild a live session from SQLite after a restart: who was in the
// room, and any answers for the game in progress.
function restoreSession(id) {
  const row = dbGetSession(id);
  if (!row) return null;
  const session = Object.create(Session.prototype);
  session.id = id;
  session.phase = 'lobby';
  session.gameId = null;
  session.results = null;
  session.round = 0;
  session.assignment = null;
  session.timerEndsAt = null;
  session.joinLink = joinDeepLink(id);
  session.players = listPlayers(id).map((p) => ({
    tgId: p.tg_id,
    name: p.name,
    username: p.username,
    avatarUrl: p.avatar_url,
    role: p.role,
  }));
  session.answers = [];
  sessions.set(id, session);
  return session;
}
