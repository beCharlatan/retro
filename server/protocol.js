/* =========================================================
   PROTOCOL — what the Mini App / projector and the server say
   =========================================================
   One WebSocket per client, JSON messages both ways. The server
   is the source of truth: after any accepted change it rebroadcasts
   the whole session snapshot (small — a session is a handful of
   people), so clients never apply diffs and a reconnect is just
   "send me the snapshot again".

     client → server   { t: 'auth', initData, role, sessionId }    first message, mandatory
     client → server   { t: 'create' }                             facilitator opens a session
     client → server   { t: 'start', gameId }                      facilitator picks a game
     client → server   { t: 'answer', answers }                    participant submits (shape per game)
     client → server   { t: 'edit', tgId, answers }                facilitator overrides a row (single-round games)
     client → server   { t: 'reveal' }                             facilitator → results
     client → server   { t: 'back' }                               facilitator → back to collection
     client → server   { t: 'restart' }                            facilitator → wipe answers, stay in game
     client → server   { t: 'toLobby' }                            facilitator → back to the game picker (answers kept)
     client → server   { t: 'advance' }                            facilitator → next round
     client → server   { t: 'timer' }                              facilitator → start the round countdown
     client → server   { t: 'dispatch' }                           facilitator → private texts to participants (bot DMs)
     client → server   { t: 'rename', name, tgId? }                participant renames self; facilitator may pass tgId
     server → client   { t: 'dispatched', items }                  what went out (to the facilitator)
     client → server   { t: 'toLobby' }                            facilitator → back to the game picker (answers kept)

     server → client   { t: 'hello', you, sessionId, role }
     server → client   { t: 'session', snapshot }                  full state, on every change
     server → client   { t: 'error', code, message }
========================================================= */

const isText = (v) => typeof v === 'string';
const clip = (v, max = 300) => v.slice(0, max);
const MAX_ANSWER_FIELDS = 12;
const MAX_ANSWER_VALUE = 1e9;

/** @returns {{t: string} & Record<string, unknown>} a clean copy, or null */
export function normalizeClientMessage(raw) {
  if (!raw || typeof raw !== 'object' || !isText(raw.t)) return null;
  const m = { t: raw.t };
  switch (raw.t) {
    case 'auth':
      if (!isText(raw.initData)) return null;
      m.initData = clip(raw.initData, 4096);
      if (raw.role === 'facilitator' || raw.role === 'participant' || raw.role === 'projector') {
        m.role = raw.role;
      }
      if (isText(raw.sessionId)) m.sessionId = clip(raw.sessionId, 16).toUpperCase();
      break;
    case 'start':
      if (!isText(raw.gameId)) return null;
      m.gameId = clip(raw.gameId, 40);
      break;
    case 'answer':
    case 'edit':
      if (!raw.answers || typeof raw.answers !== 'object' || Array.isArray(raw.answers))
        return null;
      m.answers = normalizeAnswers(raw.answers);
      if (raw.t === 'edit') {
        if (!Number.isInteger(raw.tgId)) return null;
        m.tgId = raw.tgId;
      }
      break;
    case 'rename':
      if (!isText(raw.name)) return null;
      m.name = clip(raw.name, 40).trim();
      if (!m.name) return null;
      if (Number.isInteger(raw.tgId)) m.tgId = raw.tgId; // facilitator renaming someone
      break;
    case 'create':
    case 'reveal':
    case 'back':
    case 'restart':
    case 'toLobby':
    case 'advance':
    case 'timer':
    case 'dispatch':
      break;
    default:
      return null;
  }
  return m;
}

// Answers are per-game small payloads: { anchor: 12, guess: 34 } or
// { answers: ['a', null, 'b', 'a'] }. Numbers are clamped, strings
// clipped, anything else dropped — the game declaration re-validates.
function normalizeAnswers(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw).slice(0, MAX_ANSWER_FIELDS)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[clip(k, 24)] = Math.max(-MAX_ANSWER_VALUE, Math.min(MAX_ANSWER_VALUE, v));
    } else if (isText(v)) {
      // 600 — open-text answers (Барнум) need more than numeric fields.
      out[clip(k, 24)] = clip(v, 600);
    } else if (v === null) {
      out[clip(k, 24)] = null;
    } else if (Array.isArray(v)) {
      out[clip(k, 24)] = v
        .slice(0, 16)
        .map((x) =>
          typeof x === 'number' && Number.isFinite(x)
            ? Math.max(-MAX_ANSWER_VALUE, Math.min(MAX_ANSWER_VALUE, x))
            : isText(x)
              ? clip(x, 40)
              : null,
        );
    }
  }
  return out;
}

export function serverError(code, message) {
  return { t: 'error', code: clip(code, 40), message: clip(message, 300) };
}

// ---------- the snapshot ----------

export function sessionSnapshot(session) {
  return {
    id: session.id,
    phase: session.phase, // lobby | collect | results
    joinLink: session.joinLink,
    games: session.games ?? [],
    players: session.players.map((p) => ({
      tgId: p.tgId,
      name: clip(p.name, 40),
      username: isText(p.username) ? clip(p.username, 40) : '',
      avatarUrl: isText(p.avatarUrl) ? clip(p.avatarUrl, 1024) : '',
      role: p.role,
      answered: session.answers.some((a) => a.tgId === p.tgId),
    })),
    game: session.game,
  };
}
