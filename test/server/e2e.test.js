/* =========================================================
   SERVER E2E — the real server (subprocess) + real WebSocket clients
   =========================================================
   Spins up `bun server/index.js` on a test port with an in-memory
   dev config (no BOT_TOKEN), then drives a full session over WS:
   facilitator creates a session, two participants join and answer,
   results are revealed, the projector watches. What the server
   broadcasts is asserted, not its internals.
========================================================= */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
const WS = `ws://127.0.0.1:${PORT}/ws`;
const dir = mkdtempSync(join(tmpdir(), 'retro-server-e2e-'));
// Absolute path — the test runner's cwd is test/server (bunfig.toml
// scopes a bare `bun test` to test/unit, so this suite runs from its
// own directory instead).
const SERVER_ENTRY = join(import.meta.dir, '..', '..', 'server', 'index.js');

let proc = null;

beforeAll(async () => {
  proc = Bun.spawn(['bun', SERVER_ENTRY], {
    env: { ...process.env, PORT: String(PORT), DB_PATH: join(dir, 'test.db'), BOT_TOKEN: '' },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  // wait for health
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${BASE}/healthz`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

afterAll(() => {
  proc?.kill();
  rmSync(dir, { recursive: true, force: true });
});

const dev = (name) => JSON.stringify({ dev: true, user: { name } });

/** A tiny promise-based WS test client. */
function client() {
  const ws = new WebSocket(WS);
  const inbox = [];
  const waiters = [];
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    const i = waiters.findIndex((w) => w.predicate(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  };
  const ready = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return {
    ready,
    send: (obj) => ws.send(JSON.stringify(obj)),
    // next message matching the predicate (drains the inbox first)
    next(predicate, timeoutMs = 3000) {
      const hit = inbox.findIndex(predicate);
      if (hit >= 0) return Promise.resolve(inbox.splice(hit, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`timeout waiting for: ${predicate.toString()}`)),
          timeoutMs,
        );
        waiters.push({
          predicate,
          resolve: (msg) => {
            clearTimeout(timer);
            resolve(msg);
          },
        });
      });
    },
    close: () => ws.close(),
  };
}

describe('server e2e over WebSocket', () => {
  test('facilitator + participants + projector full flow', async () => {
    const fac = client();
    await fac.ready;
    fac.send({ t: 'auth', initData: dev('Ведущий'), role: 'facilitator' });
    const hello = await fac.next((m) => m.t === 'hello');
    expect(hello.role).toBe('facilitator');
    const lobby = await fac.next((m) => m.t === 'session');
    const sessionId = lobby.snapshot.id;
    expect(lobby.snapshot.phase).toBe('lobby');
    expect(lobby.snapshot.players).toHaveLength(1);
    expect(lobby.snapshot.joinLink).toContain(sessionId);
    expect(lobby.snapshot.games).toHaveLength(19);

    // participants join via the session code
    const p1 = client();
    const p2 = client();
    await Promise.all([p1.ready, p2.ready]);
    p1.send({ t: 'auth', initData: dev('Аня'), role: 'participant', sessionId });
    p2.send({ t: 'auth', initData: dev('Боря'), role: 'participant', sessionId });
    await p1.next((m) => m.t === 'hello');
    await p2.next((m) => m.t === 'hello');
    const withPlayers = await fac.next((m) => m.t === 'session' && m.snapshot.players.length === 3);
    expect(withPlayers.snapshot.players.map((p) => p.name).sort()).toEqual([
      'Аня',
      'Боря',
      'Ведущий',
    ]);

    // projector joins read-only
    const proj = client();
    await proj.ready;
    proj.send({ t: 'auth', initData: dev('Экран'), role: 'projector', sessionId });
    await proj.next((m) => m.t === 'hello' && m.role === 'projector');

    // facilitator starts the game
    fac.send({ t: 'start', gameId: 'anchoring' });
    const collecting = await fac.next((m) => m.t === 'session' && m.snapshot.phase === 'collect');
    expect(collecting.snapshot.game.fields).toHaveLength(2);
    const projCollect = await proj.next((m) => m.t === 'session' && m.snapshot.phase === 'collect');
    expect(projCollect.snapshot.game.name).toBe('Эффект якоря');

    // participants answer; facilitator watches entries arrive
    p1.send({ t: 'answer', answers: { anchor: 12, guess: 30 } });
    p2.send({ t: 'answer', answers: { anchor: 88, guess: 62 } });
    const twoIn = await fac.next((m) => m.t === 'session' && m.snapshot.game?.answered === 2);
    expect(twoIn.snapshot.game.entries).toHaveLength(2);
    expect(twoIn.snapshot.game.entries[0].flat.guess).toBe(30);

    // projector cannot answer
    proj.send({ t: 'answer', answers: { anchor: 1, guess: 1 } });
    const denied = await proj.next((m) => m.t === 'error');
    expect(denied.code).toBe('forbidden');

    // facilitator reveals → results broadcast to everyone
    fac.send({ t: 'reveal' });
    const results = await p1.next((m) => m.t === 'session' && m.snapshot.phase === 'results');
    expect(results.snapshot.game.results.headline).toMatch(/^r = /);
    expect(results.snapshot.game.results.detail).toContain('Якорь'.toLowerCase().slice(0, 1)); // sanity: text exists
    const projResults = await proj.next((m) => m.t === 'session' && m.snapshot.phase === 'results');
    expect(projResults.snapshot.game.results.headline).toMatch(/^r = /);

    // back to collect, then restart wipes answers for everyone
    fac.send({ t: 'back' });
    await p1.next((m) => m.t === 'session' && m.snapshot.phase === 'collect');
    fac.send({ t: 'restart' });
    const wiped = await proj.next((m) => m.t === 'session' && m.snapshot.game?.answered === 0);
    expect(wiped.snapshot.phase).toBe('collect');
  });

  test('participant with a bad session code gets an error', async () => {
    const p = client();
    await p.ready;
    p.send({ t: 'auth', initData: dev('Аня'), role: 'participant', sessionId: 'XXXXX' });
    const err = await p.next((m) => m.t === 'error');
    expect(err.code).toBe('no_session');
  });

  test('messages before auth are rejected', async () => {
    const p = client();
    await p.ready;
    p.send({ t: 'start', gameId: 'anchoring' });
    const err = await p.next((m) => m.t === 'error');
    expect(err.code).toBe('unauthorized');
  });

  test('static pages are served', async () => {
    const tma = await fetch(`${BASE}/`);
    expect(tma.status).toBe(200);
    expect(await tma.text()).toContain('5 минут общего развития');
    const projector = await fetch(`${BASE}/projector`);
    expect(projector.status).toBe(200);
  });
});

describe('Этап 2 e2e: pairs, rounds, privacy, dispatch', () => {
  test('ultimatum two-round flow over WebSocket; participant snapshot is private', async () => {
    const fac = client();
    await fac.ready;
    fac.send({ t: 'auth', initData: dev('Ведущий'), role: 'facilitator' });
    await fac.next((m) => m.t === 'hello');
    const lobby = await fac.next((m) => m.t === 'session');
    const sessionId = lobby.snapshot.id;

    const players = ['Аня', 'Боря', 'Вера', 'Гоша'];
    const parts = players.map((name) => {
      const c = client();
      c.ready.then(() =>
        c.send({ t: 'auth', initData: dev(name), role: 'participant', sessionId }),
      );
      return c;
    });
    await Promise.all(parts.map((c) => c.next((m) => m.t === 'hello')));
    await fac.next((m) => m.t === 'session' && m.snapshot.players.length === 5);

    fac.send({ t: 'start', gameId: 'ultimatum' });
    const started = await fac.next((m) => m.t === 'session' && m.snapshot.phase === 'collect');
    const roster = started.snapshot.game.roster;
    expect(roster.kind).toBe('pairs');
    expect(roster.pairs).toHaveLength(2);

    // facilitator sees pair rows; a participant sees only their own field
    expect(started.snapshot.game.entries).toHaveLength(2);
    const p1view = await parts[0].next((m) => m.t === 'session' && m.snapshot.game?.roster);
    expect(p1view.snapshot.game.fields).toHaveLength(1);
    expect(p1view.snapshot.game.entries).toBeUndefined(); // no one else's answers
    const myKey = p1view.snapshot.game.fields[0].key;
    expect(myKey).toMatch(/^r1_(offer|min)$/);
    const pair = roster.pairs.find((p) => p.a === players[0] || p.b === players[0]);
    const isA = pair.a === players[0];
    expect(myKey).toBe(isA ? 'r1_offer' : 'r1_min');

    // everyone answers round 0 with their own role key
    parts.forEach((c, i) => {
      const pairI = roster.pairs.find((p) => p.a === players[i] || p.b === players[i]);
      const key = (pairI.a === players[i]) === true ? 'r1_offer' : 'r1_min';
      c.send({ t: 'answer', answers: { [key]: 400 } });
    });
    const r1done = await fac.next((m) => m.t === 'session' && m.snapshot.game?.answered === 4);
    expect(r1done.snapshot.game.round.index).toBe(0);

    // reveal is blocked before round 2
    fac.send({ t: 'reveal' });
    const blocked = await fac.next((m) => m.t === 'error');
    expect(blocked.code).toBe('rejected');

    fac.send({ t: 'advance' });
    const round2 = await parts[0].next(
      (m) => m.t === 'session' && m.snapshot.game?.round?.index === 1,
    );
    const r2key = round2.snapshot.game.fields[0].key;
    expect(r2key).toBe(isA ? 'r2_min' : 'r2_offer');

    parts.forEach((c, i) => {
      const pairI = roster.pairs.find((p) => p.a === players[i] || p.b === players[i]);
      const key = pairI.a === players[i] ? 'r2_min' : 'r2_offer';
      c.send({ t: 'answer', answers: { [key]: 300 } });
    });
    await fac.next((m) => m.t === 'session' && m.snapshot.game?.answered === 4);

    fac.send({ t: 'reveal' });
    const results = await fac.next((m) => m.t === 'session' && m.snapshot.phase === 'results');
    expect(results.snapshot.game.results.headline).toMatch(/%$/);
    // 400 ≥ 300 → every deal happens
    expect(results.snapshot.game.results.payload.deals).toBe(4);
  });

  test('hidden-profile dispatch returns items; without a bot they are undelivered', async () => {
    const fac = client();
    await fac.ready;
    fac.send({ t: 'auth', initData: dev('Ведущий'), role: 'facilitator' });
    await fac.next((m) => m.t === 'hello');
    const lobby = await fac.next((m) => m.t === 'session');
    const sessionId = lobby.snapshot.id;

    for (const name of ['Аня', 'Боря', 'Вера']) {
      const c = client();
      await c.ready;
      c.send({ t: 'auth', initData: dev(name), role: 'participant', sessionId });
    }
    await fac.next((m) => m.t === 'session' && m.snapshot.players.length === 4);

    fac.send({ t: 'start', gameId: 'hidden-profile' });
    await fac.next((m) => m.t === 'session' && m.snapshot.phase === 'collect');
    fac.send({ t: 'dispatch' });
    const disp = await fac.next((m) => m.t === 'dispatched');
    expect(disp.items).toHaveLength(3);
    expect(disp.items.map((i) => i.text)).toEqual([
      expect.stringContaining('досье №1'),
      expect.stringContaining('досье №2'),
      expect.stringContaining('досье №3'),
    ]);
    expect(disp.items.every((i) => !i.delivered)).toBe(true); // dev mode, no bot
    // dossiers never appear in the broadcast snapshot
    const snap = await fac.next((m) => m.t === 'session');
    expect(JSON.stringify(snap)).not.toContain('досье');
  });
});

describe('Этап 3 e2e: anonymous projector view', () => {
  test('dictator: projector sees sorted values only, never names', async () => {
    const fac = client();
    await fac.ready;
    fac.send({ t: 'auth', initData: dev('Ведущий'), role: 'facilitator' });
    await fac.next((m) => m.t === 'hello');
    const lobby = await fac.next((m) => m.t === 'session');
    const sessionId = lobby.snapshot.id;

    const parts = ['Аня', 'Боря', 'Вера'].map((name) => {
      const c = client();
      c.ready.then(() =>
        c.send({ t: 'auth', initData: dev(name), role: 'participant', sessionId }),
      );
      return c;
    });
    await Promise.all(parts.map((c) => c.next((m) => m.t === 'hello')));
    await fac.next((m) => m.t === 'session' && m.snapshot.players.length === 4);

    const proj = client();
    await proj.ready;
    proj.send({ t: 'auth', initData: dev('Экран'), role: 'projector', sessionId });
    await proj.next((m) => m.t === 'hello' && m.role === 'projector');

    fac.send({ t: 'start', gameId: 'dictator' });
    await fac.next((m) => m.t === 'session' && m.snapshot.phase === 'collect');

    parts[0].send({ t: 'answer', answers: { r1: 300 } });
    parts[1].send({ t: 'answer', answers: { r1: 100 } });
    parts[2].send({ t: 'answer', answers: { r1: 700 } });

    const anon = await proj.next(
      (m) => m.t === 'session' && m.snapshot.game?.anonymous?.values?.length === 3,
    );
    expect(anon.snapshot.game.entries).toEqual([]); // никаких строк с именами
    expect(anon.snapshot.game.anonymous.values).toEqual([100, 300, 700]); // только суммы, по порядку
    // в чужом снимке участника тоже нет чужих значений
    const p1 = await parts[0].next((m) => m.t === 'session' && m.snapshot.game?.answered === 3);
    expect(p1.snapshot.game.entries).toBeUndefined();
    expect(p1.snapshot.game.anonymous).toBeUndefined();
    // фасилитатор видит строки (как в офлайн-форме)
    const facView = await fac.next((m) => m.t === 'session' && m.snapshot.game?.answered === 3);
    expect(facView.snapshot.game.entries).toHaveLength(3);
  });
});
