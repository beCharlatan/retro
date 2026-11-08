/* =========================================================
   WS HUB — rooms per session, routing client messages
   =========================================================
   One socket per client. The first message must be `auth`
   (initData + role + optional sessionId); everything else is
   rejected before that.

   Snapshots are ROLE-AWARE (see wireSession): the facilitator gets
   the full picture, a participant gets only their own slice —
   fields, their answers, their pair/role — never other people's
   answers, and the projector gets the public picture (roster, live
   entries, results) and no answer forms at all. The server is the
   source of truth; after any accepted mutation it rebroadcasts.
========================================================= */
import { validateInitData } from './auth.js';
import { sendDirectMessage } from './bot.js';
import { gameSummaries } from './games/index.js';
import { normalizeClientMessage, serverError, sessionSnapshot } from './protocol.js';
import { createSession, getSession, joinSession } from './session.js';

const TIMER_GRACE_MS = 60;

export class Hub {
  constructor() {
    this.rooms = new Map(); // sessionId -> Set<socket>
    this.meta = new Map(); // socket -> { user, sessionId, role }
    this.timers = new Map(); // sessionId -> timeout (advisory countdown)
  }

  add(sessionId, socket, meta) {
    if (!this.rooms.has(sessionId)) this.rooms.set(sessionId, new Set());
    this.rooms.get(sessionId).add(socket);
    this.meta.set(socket, meta);
  }

  remove(socket) {
    const m = this.meta.get(socket);
    this.meta.delete(socket);
    if (!m) return;
    const room = this.rooms.get(m.sessionId);
    room?.delete(socket);
    if (room && room.size === 0) {
      this.rooms.delete(m.sessionId);
      clearTimeout(this.timers.get(m.sessionId));
      this.timers.delete(m.sessionId);
    }
  }

  send(socket, message) {
    try {
      socket.send(JSON.stringify(message));
    } catch {
      this.remove(socket);
    }
  }

  sendTo(socket, message) {
    this.send(socket, message);
  }

  broadcast(sessionId, message) {
    const room = this.rooms.get(sessionId);
    if (!room) return;
    const json = JSON.stringify(message);
    for (const socket of room) {
      try {
        socket.send(json);
      } catch {
        this.remove(socket);
      }
    }
  }

  // Every socket in the room gets a snapshot shaped for ITS role.
  broadcastSession(session) {
    const room = this.rooms.get(session.id);
    if (!room) return;
    for (const socket of room) {
      const m = this.meta.get(socket);
      if (!m) continue;
      this.send(socket, {
        t: 'session',
        snapshot: sessionSnapshot(wireSession(session, m)),
      });
    }
  }

  // One 'done' tick when the advisory countdown reaches zero.
  armTimer(session) {
    clearTimeout(this.timers.get(session.id));
    const state = session.timerState();
    if (!state || state.state !== 'running') return;
    const endsAt = session.timerEndsAt;
    this.timers.set(
      session.id,
      setTimeout(
        () => {
          if (getSession(session.id)?.timerEndsAt === endsAt) this.broadcastSession(session);
        },
        state.remaining * 1000 + TIMER_GRACE_MS,
      ),
    );
  }
}

// The wire shape of a session, per viewer role. `viewer` is the
// socket's hub meta: { role: facilitator|participant|projector, user }.
function wireSession(session, viewer) {
  const base = {
    id: session.id,
    phase: session.phase,
    joinLink: session.joinLink,
    players: session.players,
    answers: session.answers.map((a) => ({ tgId: a.tgId })),
    games: gameSummaries(),
    game: null,
  };
  const game = session.game;
  if (!game) return base;
  return { ...base, game: gameView(session, game, viewer) };
}

function gameView(session, game, viewer) {
  const round = session.round;
  const assignment = session.assignment;
  const named = session.namedAnswers();
  const timer = session.timerState();

  const view = {
    id: game.id,
    name: game.name,
    phase: session.phase,
    structure: game.structure,
    minPlayers: game.minPlayers,
    rules: game.rules,
    round: {
      index: round,
      total: game.rounds,
      title: game.roundTitle(round),
      timer,
    },
    roster: game.roster(assignment),
    answered: session.answeredCount(),
    editable: game.rounds === 1 && session.phase === 'collect',
    timerSupported: Boolean(game.timerSeconds(round)),
    dispatchable: game.hasDispatch === true,
  };

  if (session.phase === 'results' && session.results) {
    view.results = {
      headline: game.headline(session.results),
      detail: game.detail(session.results),
      payload: session.results,
    };
  }

  if (viewer.role === 'facilitator') {
    // The full picture: every row with its display cells and a flat
    // copy for the edit form. Fields are sent too (the edit modal);
    // they are the round-0 view, which is exact for the single-round
    // games where editing is allowed.
    view.entries = game.entries(named, assignment).map((e) => ({
      ...e,
      flat: game.flatten(e.payload),
    }));
    view.fields = game.fieldsFor(0, session.ctxFor({ name: '', tgId: 0 }));
  } else if (viewer.role === 'participant') {
    // Only my slice: my fields for the current round, my context card,
    // my current answers (to prefill). Other people's answers never
    // leave the server before the reveal.
    const me = session.player(viewer.user.tgId);
    const ctx = session.ctxFor(me ?? { name: '?', tgId: 0 });
    const myFields = game.fieldsFor(round, ctx);
    const flat = game.flatten(session.answerOf(viewer.user.tgId)?.payload ?? game.empty());
    view.fields = myFields;
    view.my = {
      info: game.myInfo(round, ctx),
      answers: Object.fromEntries(myFields.map((f) => [f.key, flat[f.key] ?? null])),
    };
  } else {
    // projector: the public picture — live rows as they fill, results
    // on reveal. No forms, no private texts. Anonymous games get no
    // per-person rows at all, only the current round's sorted values.
    if (game.anonymous) {
      const flat = named
        .map((n) => game.flatten(n.payload))
        .flatMap((f) => Object.values(f))
        .filter((v) => v !== null && v !== undefined)
        .sort((a, b) => Number(a) - Number(b));
      view.anonymous = { values: flat };
      view.entries = [];
    } else {
      view.entries = game.entries(named, assignment).map((e) => ({
        name: e.name,
        tag: e.tag ?? '',
        cells: e.cells,
      }));
    }
  }
  // Between-round recap (aggregate, from the declaration) — facilitator
  // and projector only; participants hear it from the facilitator.
  if (round > 0 && game.recap) {
    view.recap = game.recap(round, named, assignment);
  }
  return view;
}

// ---------- the per-socket message handler ----------

export function handleMessage(hub, socket, rawText) {
  const meta = hub.meta.get(socket);

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return hub.send(socket, serverError('bad_json', 'Некорректное сообщение'));
  }
  const msg = normalizeClientMessage(parsed);
  if (!msg) return hub.send(socket, serverError('bad_message', 'Некорректное сообщение'));

  // Everything but auth requires an authenticated socket.
  if (msg.t !== 'auth' && !meta) {
    return hub.send(socket, serverError('unauthorized', 'Сначала отправьте auth'));
  }

  switch (msg.t) {
    case 'auth': {
      const user = validateInitData(msg.initData);
      if (!user)
        return hub.send(
          socket,
          serverError('auth_failed', 'Не удалось проверить подлинность Telegram'),
        );
      if (meta) hub.remove(socket);

      if (msg.role === 'facilitator') {
        const session = msg.sessionId ? getSession(msg.sessionId) : createSession(user);
        if (!session) return hub.send(socket, serverError('no_session', 'Сессия не найдена'));
        session.addPlayer(user, 'facilitator');
        hub.add(session.id, socket, { user, sessionId: session.id, role: 'facilitator' });
        hub.send(socket, { t: 'hello', you: user, sessionId: session.id, role: 'facilitator' });
        return hub.broadcastSession(session);
      }

      if (msg.role === 'projector') {
        // Read-only big screen: joins the room, never the player list.
        if (!msg.sessionId) return hub.send(socket, serverError('no_session', 'Нет кода сессии'));
        const session = getSession(msg.sessionId);
        if (!session) return hub.send(socket, serverError('no_session', 'Сессия не найдена'));
        hub.add(session.id, socket, { user, sessionId: session.id, role: 'projector' });
        hub.send(socket, { t: 'hello', you: user, sessionId: session.id, role: 'projector' });
        return hub.broadcastSession(session);
      }

      // participant
      if (!msg.sessionId) return hub.send(socket, serverError('no_session', 'Нет кода сессии'));
      const session = joinSession(msg.sessionId, user);
      if (!session)
        return hub.send(socket, serverError('no_session', 'Сессия не найдена — проверьте ссылку'));
      hub.add(session.id, socket, { user, sessionId: session.id, role: 'participant' });
      hub.send(socket, { t: 'hello', you: user, sessionId: session.id, role: 'participant' });
      return hub.broadcastSession(session);
    }

    case 'create': {
      if (meta.role !== 'facilitator')
        return hub.send(socket, serverError('forbidden', 'Только ведущий'));
      const session = createSession(meta.user);
      hub.add(session.id, socket, meta);
      hub.send(socket, { t: 'hello', you: meta.user, sessionId: session.id, role: 'facilitator' });
      return hub.broadcastSession(session);
    }

    case 'start':
    case 'reveal':
    case 'back':
    case 'restart':
    case 'toLobby':
    case 'advance':
    case 'timer': {
      if (meta.role !== 'facilitator')
        return hub.send(socket, serverError('forbidden', 'Только ведущий'));
      const session = getSession(meta.sessionId);
      if (!session) return hub.send(socket, serverError('no_session', 'Сессия не найдена'));
      const result =
        msg.t === 'start'
          ? session.startGame(msg.gameId)
          : msg.t === 'reveal'
            ? session.reveal()
            : msg.t === 'back'
              ? session.back()
              : msg.t === 'restart'
                ? session.restart()
                : msg.t === 'toLobby'
                  ? session.toLobby()
                  : msg.t === 'advance'
                    ? session.advance()
                    : session.startTimer();
      if (!result.ok) return hub.send(socket, serverError('rejected', result.error));
      if (msg.t === 'timer') hub.armTimer(session);
      return hub.broadcastSession(session);
    }

    case 'dispatch': {
      if (meta.role !== 'facilitator')
        return hub.send(socket, serverError('forbidden', 'Только ведущий'));
      const session = getSession(meta.sessionId);
      if (!session) return hub.send(socket, serverError('no_session', 'Сессия не найдена'));
      return session.dispatch(sendDirectMessage).then((result) => {
        if (!result.ok) return hub.send(socket, serverError('rejected', result.error));
        hub.sendTo(socket, { t: 'dispatched', items: result.items });
        return hub.broadcastSession(session);
      });
    }

    case 'rename': {
      const session = getSession(meta.sessionId);
      if (!session) return hub.send(socket, serverError('no_session', 'Сессия не найдена'));
      // A participant renames only themselves; the facilitator anyone.
      const tgId = meta.role === 'facilitator' && msg.tgId ? msg.tgId : meta.user.tgId;
      const result = session.renamePlayer(tgId, msg.name);
      if (!result.ok) return hub.send(socket, serverError('rejected', result.error));
      return hub.broadcastSession(session);
    }

    case 'answer': {
      if (meta.role !== 'participant')
        return hub.send(socket, serverError('forbidden', 'Отвечать может только участник'));
      const session = getSession(meta.sessionId);
      if (!session) return hub.send(socket, serverError('no_session', 'Сессия не найдена'));
      const result = session.submitAnswer(meta.user.tgId, msg.answers);
      if (!result.ok) return hub.send(socket, serverError('rejected', result.error));
      return hub.broadcastSession(session);
    }

    case 'edit': {
      if (meta.role !== 'facilitator')
        return hub.send(socket, serverError('forbidden', 'Только ведущий'));
      const session = getSession(meta.sessionId);
      if (!session) return hub.send(socket, serverError('no_session', 'Сессия не найдена'));
      const result = session.facilitatorEdit(msg.tgId, msg.answers);
      if (!result.ok) return hub.send(socket, serverError('rejected', result.error));
      return hub.broadcastSession(session);
    }

    default:
      return hub.send(socket, serverError('bad_message', 'Неизвестное сообщение'));
  }
}
