/* =========================================================
   PROJECTOR PROTOCOL — what the game window and the projector window say
   =========================================================
   Two windows of the same app talk through window.postMessage (the game window
   opens the projector with window.open, so each holds a reference to the other
   — this works from a file:// page in Chrome and Safari, where BroadcastChannel
   and storage events are not dependable).

     projector → game   { hello, rev }        "I'm here; the last picture I have is `rev`"
     game → projector   { snapshot, rev }     the whole picture to show (never a diff)

   A snapshot is plain data — a headline, one timer, and a list of HTML blocks the
   game marked as public (data-projector). It never contains inputs, buttons,
   participant answers or the texts meant for the groups: the game window decides
   what leaves it (see controllers/projector-controller.js), the projector just
   draws what it is given.
========================================================= */

export const CHANNEL = 'retro-projector';
export const VERSION = 1;
export const WINDOW_NAME = 'retro-projector';

export const TIMER_STATES = ['idle', 'running', 'done'];
export const BLOCK_ROLES = ['eyebrow', 'title', 'lede', 'body', 'reveal', 'chart'];

export const helloMessage = (rev) => ({ channel: CHANNEL, v: VERSION, type: 'hello', rev });
export const snapshotMessage = (snapshot, rev) => ({
  channel: CHANNEL,
  v: VERSION,
  type: 'snapshot',
  rev,
  snapshot,
});

export function isProjectorMessage(data, type) {
  return (
    !!data &&
    typeof data === 'object' &&
    data.channel === CHANNEL &&
    data.v === VERSION &&
    data.type === type
  );
}

// The accent arrives as a style string (--game-accent:#…;--game-accent-deep:#…). It goes into a
// style attribute, so only custom properties with plain colour values are let through.
const ACCENT_DECL = /^--[a-z-]+:\s*(#[0-9a-f]{3,8}|rgba?\([\d\s,.%]+\)|hsla?\([\d\s,.%]+\))$/i;
export function safeAccentStyle(style) {
  if (typeof style !== 'string') return '';
  const decls = style
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean);
  return decls.every((d) => ACCENT_DECL.test(d)) ? `${decls.join(';')};` : '';
}

const isText = (v) => typeof v === 'string';
const MAX_ROWS = 60;
const MAX_NAMES = 60;
const MAX_TEXT = 120;
const clip = (v) => v.slice(0, MAX_TEXT);
const names = (list) =>
  (Array.isArray(list) ? list : []).filter(isText).slice(0, MAX_NAMES).map(clip);

// Who is in which group / pair — public: the people in the room need to see it. Groups carry a
// `tone` ('a' | 'b') so the two colours stay the same as in the game window.
// What has been typed in so far, person by person (or pair by pair), so the room can watch the
// results come in. Only people with at least one value are sent. An `anonymous` list has no names
// at all — the game promised nobody would know who wrote what — and is sorted by `key`, so even
// the order says nothing about who is who.
export function normalizeEntries(raw) {
  if (!raw || typeof raw !== 'object' || !isText(raw.title)) return null;
  const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  const anonymous = raw.anonymous === true;
  const rows = (Array.isArray(raw.rows) ? raw.rows : [])
    .filter((r) => r && Array.isArray(r.cells))
    .slice(0, MAX_ROWS)
    .map((r) => ({
      who: anonymous ? [] : names(r.who).slice(0, 2),
      tag: !anonymous && isText(r.tag) ? clip(r.tag) : '',
      key: Number.isFinite(r.key) ? r.key : null,
      cells: r.cells
        .filter((c) => c && isText(c.label) && isText(c.value))
        .slice(0, 6)
        .map((c) => ({ label: clip(c.label), value: clip(c.value) })),
    }))
    .filter((r) => r.cells.length > 0 && (anonymous || r.who.length > 0));
  return {
    title: clip(raw.title),
    unit: isText(raw.unit) ? clip(raw.unit) : 'человек',
    anonymous,
    total: count(raw.total),
    filled: count(raw.filled),
    rows,
  };
}

export function normalizeRoster(raw) {
  if (!raw || typeof raw !== 'object' || !isText(raw.title)) return null;
  if (raw.kind === 'groups') {
    const groups = (Array.isArray(raw.groups) ? raw.groups : [])
      .filter((g) => g && isText(g.label))
      .slice(0, 6)
      .map((g) => ({
        label: clip(g.label),
        tone: g.tone === 'b' ? 'b' : 'a',
        names: names(g.names),
      }));
    return groups.length ? { kind: 'groups', title: clip(raw.title), groups } : null;
  }
  if (raw.kind === 'pairs') {
    const pairs = (Array.isArray(raw.pairs) ? raw.pairs : [])
      .filter((p) => p && isText(p.a) && isText(p.b))
      .slice(0, MAX_NAMES)
      .map((p) => ({
        a: clip(p.a),
        b: clip(p.b),
        tagA: isText(p.tagA) ? clip(p.tagA) : '',
        tagB: isText(p.tagB) ? clip(p.tagB) : '',
        trio: p.trio === true,
      }));
    return pairs.length ? { kind: 'pairs', title: clip(raw.title), pairs } : null;
  }
  return null;
}
const isCount = (v) => Number.isInteger(v) && v >= 0;

// Checks a received snapshot and returns a clean copy — or null if it isn't one. Anything the
// projector shows has passed through here, so a malformed message can only ever show nothing.
export function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.kind === 'idle') {
    return { kind: 'idle', participants: names(raw.participants), people: names(raw.people) };
  }
  if (raw.kind !== 'game') return null;
  if (!isText(raw.gameId) || !isText(raw.gameName)) return null;
  const step = raw.step;
  if (!step || !isCount(step.index) || !isCount(step.total) || !isText(step.title)) return null;

  let timer = null;
  if (raw.timer) {
    const t = raw.timer;
    if (
      !Number.isFinite(t.seconds) ||
      !Number.isFinite(t.duration) ||
      t.duration <= 0 ||
      !TIMER_STATES.includes(t.state)
    ) {
      return null;
    }
    timer = {
      seconds: Math.max(0, Math.floor(t.seconds)),
      duration: Math.floor(t.duration),
      state: t.state,
      label: isText(t.label) ? t.label : '',
    };
  }

  const blocks = [];
  for (const b of Array.isArray(raw.blocks) ? raw.blocks : []) {
    if (b && BLOCK_ROLES.includes(b.role) && isText(b.html)) {
      blocks.push({ role: b.role, html: b.html });
    }
  }

  return {
    kind: 'game',
    gameId: raw.gameId,
    gameName: raw.gameName,
    accent: safeAccentStyle(raw.accent),
    step: { index: step.index, total: step.total, title: step.title },
    timer,
    people: names(raw.people),
    roster: normalizeRoster(raw.roster),
    entries: normalizeEntries(raw.entries),
    blocks,
  };
}
