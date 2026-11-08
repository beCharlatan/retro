/* =========================================================
   SERVER TESTS — declarations, protocol, auth, session
   Run via `bun run test:server` (cwd is this directory, DB in
   memory, bot API never called).
========================================================= */
import { describe, expect, test } from 'bun:test';

process.env.DB_PATH = ':memory:';

const { GAMES, getGame } = await import('../../server/games/index.js');
const { normalizeClientMessage, serverError } = await import('../../server/protocol.js');
const sessionMod = await import('../../server/session.js');
const { validateInitData } = await import('../../server/auth.js');

describe('online game declarations', () => {
  test('registry has all 19 online games (21 minus dollar-auction & beer-game) with required parts', () => {
    expect(GAMES.map((g) => g.id).sort()).toEqual(
      [
        'anchoring',
        'availability',
        'barnum',
        'beauty-contest',
        'calibration',
        'crowd-wisdom',
        'dictator',
        'el-farol',
        'endowment',
        'false-consensus',
        'framing',
        'hidden-profile',
        'lemons',
        'planning-fallacy',
        'prisoners-dilemma',
        'public-goods',
        'ultimatum',
        'volunteer',
        'weakest-link',
      ].sort(),
    );
    for (const g of GAMES) {
      expect(g.name).toBeTruthy();
      expect(g.minPlayers).toBeGreaterThanOrEqual(2);
      expect(['solo', 'pairs', 'groups', 'team']).toContain(g.structure);
      expect(g.rounds).toBeGreaterThanOrEqual(1);
      expect(typeof g.validateRound).toBe('function');
      expect(typeof g.compute).toBe('function');
      expect(typeof g.flatten).toBe('function');
      expect(typeof g.headline).toBe('function');
      expect(typeof g.detail).toBe('function');
      expect(typeof g.fieldsFor).toBe('function');
      expect(typeof g.roundFilled).toBe('function');
      expect(typeof g.complete).toBe('function');
      expect(Array.isArray(g.fieldsFor(0, { me: 'Аня', assignment: null }))).toBe(true);
    }
  });

  // solo games keep their flat `fields` list; round/pair games expose
  // fields per round via fieldsFor with an assignment in ctx.
  test('solo games expose plain fields; pair games need an assignment', () => {
    expect(Array.isArray(getGame('anchoring').fields)).toBe(true);
    expect(getGame('ultimatum').fields).toBeUndefined();
    const participants = ['Аня', 'Боря', 'Вера', 'Гоша'].map((name, i) => ({ tgId: i + 1, name }));
    const assignment = getGame('ultimatum').assignment(participants);
    expect(assignment.pairs.length).toBeGreaterThan(0);
    for (const p of participants) {
      const fields = getGame('ultimatum').fieldsFor(0, { me: p.name, assignment });
      expect(fields).toHaveLength(1);
      expect(fields[0].key).toMatch(/^r1_(offer|min)$/);
    }
  });

  test('validate rejects an all-empty answer', () => {
    const g = getGame('anchoring');
    expect(g.validateRound({}, 0, { me: 'Аня' }, g.empty()).ok).toBe(false);
  });

  test('validate clamps numbers into the field range', () => {
    const g = getGame('anchoring');
    const r = g.validateRound({ anchor: 137, guess: -5 }, 0, { me: 'Аня' }, g.empty());
    expect(r.ok).toBe(true);
    expect(r.patch.anchor).toBe(99);
    expect(r.patch.guess).toBe(0);
  });

  test('flatten round-trips through validateRound (all games)', () => {
    const participants = ['Аня', 'Боря', 'Вера', 'Гоша'].map((name, i) => ({ tgId: i + 1, name }));
    for (const g of GAMES) {
      const assignment = g.assignment ? g.assignment(participants) : null;
      const ctx = { me: 'Аня', assignment };
      const sample = {};
      for (const f of g.fieldsFor(0, ctx))
        sample[f.key] = f.kind === 'choice' ? f.options[0].value : 7;
      const check = g.validateRound(sample, 0, ctx, g.empty());
      expect(check.ok).toBe(true);
      const merged = { ...g.empty(), ...check.patch };
      const flat = g.flatten(merged);
      for (const f of g.fieldsFor(0, ctx)) {
        expect(flat).toHaveProperty(f.key);
      }
    }
  });

  test('anchoring compute matches src/logic (low anchor → lower guesses)', () => {
    const g = getGame('anchoring');
    const answers = [
      { name: 'А', payload: { anchor: 15, guess: 30 } },
      { name: 'Б', payload: { anchor: 20, guess: 35 } },
      { name: 'В', payload: { anchor: 80, guess: 60 } },
      { name: 'Г', payload: { anchor: 90, guess: 65 } },
    ];
    const r = g.compute(answers);
    expect(r.filled).toBe(4);
    expect(r.r).toBeGreaterThan(0.9); // near-perfect positive correlation
    expect(r.lowAvg).toBe('33%');
    expect(r.highAvg).toBe('63%');
    expect(g.headline(r)).toMatch(/^r = /);
  });

  test('planning-fallacy compute via src/logic', () => {
    const g = getGame('planning-fallacy');
    const r = g.compute([
      { name: 'А', payload: { best: 8, actual: 16 } },
      { name: 'Б', payload: { best: 4, actual: 9 } },
    ]);
    expect(r.avgRatio).toBeCloseTo((16 / 8 + 9 / 4) / 2, 5);
    expect(r.overrunCount).toBe(2);
    expect(g.headline(r)).toBe('×2.1');
  });

  test('crowd-wisdom compute counts worse-than-average guesses', () => {
    const g = getGame('crowd-wisdom');
    const r = g.compute([
      { name: 'А', payload: { guesses: [400, 200, 40000] } },
      { name: 'Б', payload: { guesses: [440, 210, 40100] } },
      { name: 'В', payload: { guesses: [1000, 400, 41000] } },
    ]);
    expect(r.totalAnswered).toBe(9);
    // only the outlier guess in each question loses to the average
    expect(r.hitRate).toBe(33);
  });

  test('availability compute counts only answered questions', () => {
    const g = getGame('availability');
    const r = g.compute([
      { name: 'А', payload: { answers: ['b', 'a', 'b', 'a'] } }, // all correct
      { name: 'Б', payload: { answers: ['a', 'a', null, null] } }, // 1 of 2
    ]);
    expect(r.totalCorrect).toBe(5);
    expect(r.totalAnswered).toBe(6);
  });

  test('entries carry tgId and cells; flatten maps nested payloads', () => {
    const g = getGame('crowd-wisdom');
    const rows = g.entries([{ tgId: 42, name: 'Аня', payload: { guesses: [1, 2, 3] } }]);
    expect(rows[0].tgId).toBe(42);
    expect(rows[0].cells.map((c) => c.value)).toEqual(['1', '2', '3']);
    expect(g.flatten(rows[0].payload)).toEqual({ q0: 1, q1: 2, q2: 3 });
  });
});

describe('protocol normalization', () => {
  test('drops malformed messages', () => {
    expect(normalizeClientMessage(null)).toBeNull();
    expect(normalizeClientMessage({})).toBeNull();
    expect(normalizeClientMessage({ t: 'nope' })).toBeNull();
    expect(normalizeClientMessage({ t: 'auth' })).toBeNull();
    expect(normalizeClientMessage({ t: 'start' })).toBeNull();
    expect(normalizeClientMessage({ t: 'edit', answers: {}, tgId: 'x' })).toBeNull();
  });

  test('auth passes role and uppercases the session code', () => {
    const m = normalizeClientMessage({
      t: 'auth',
      initData: 'x',
      role: 'participant',
      sessionId: 'abc12',
    });
    expect(m.role).toBe('participant');
    expect(m.sessionId).toBe('ABC12');
  });

  test('answer payloads are clamped', () => {
    const m = normalizeClientMessage({
      t: 'answer',
      answers: { a: 1e12, b: 'x'.repeat(500), c: [1, 2, 3] },
    });
    expect(m.answers.a).toBe(1e9);
    expect(m.answers.b).toHaveLength(500); // open-text cap (Барнум)
    expect(m.answers.c).toEqual([1, 2, 3]);
  });

  test('serverError clips long texts', () => {
    const e = serverError('x'.repeat(100), 'у'.repeat(1000));
    expect(e.code).toHaveLength(40);
    expect(e.message).toHaveLength(300);
  });
});

describe('session lifecycle', () => {
  test('full flow: create → join → start → answer → reveal → back → restart', () => {
    const s = sessionMod.createSession({ tgId: 1, name: 'Ведущий' });
    expect(s.phase).toBe('lobby');
    expect(s.player(1).role).toBe('facilitator');

    expect(sessionMod.joinSession(s.id, { tgId: 2, name: 'Аня' }).id).toBe(s.id);
    expect(sessionMod.joinSession(s.id, { tgId: 3, name: 'Боря' }).id).toBe(s.id);

    // need minPlayers participants
    expect(s.startGame('anchoring').ok).toBe(true);
    expect(s.phase).toBe('collect');

    expect(s.submitAnswer(2, { anchor: 10, guess: 25 }).ok).toBe(true);
    expect(s.submitAnswer(3, { anchor: 90, guess: 60 }).ok).toBe(true);
    // non-participant cannot answer — enforced at ws layer; here tgId just stores
    expect(s.answeredCount()).toBe(2);

    // facilitator tops up a wrong row
    expect(s.facilitatorEdit(2, { anchor: 12, guess: 28 }).ok).toBe(true);
    expect(s.answers.find((a) => a.tgId === 2).payload.guess).toBe(28);

    // cannot edit an unknown player
    expect(s.facilitatorEdit(999, { anchor: 1, guess: 1 }).ok).toBe(false);

    expect(s.reveal().ok).toBe(true);
    expect(s.phase).toBe('results');
    expect(s.results.r).toBeGreaterThan(0.9);

    expect(s.back().ok).toBe(true);
    expect(s.phase).toBe('collect');

    expect(s.restart().ok).toBe(true);
    expect(s.answeredCount()).toBe(0);
    expect(sessionMod.getSession(s.id).answers).toHaveLength(0);
  });

  test('startGame enforces minPlayers and unknown games', () => {
    const s = sessionMod.createSession({ tgId: 1, name: 'Ведущий' });
    expect(s.startGame('nope').ok).toBe(false);
    sessionMod.joinSession(s.id, { tgId: 2, name: 'Аня' });
    expect(s.startGame('anchoring').ok).toBe(false); // only 1 participant
  });

  test('answers survive a simulated restart (restored from SQLite)', () => {
    const s = sessionMod.createSession({ tgId: 1, name: 'Ведущий' });
    sessionMod.joinSession(s.id, { tgId: 2, name: 'Аня' });
    sessionMod.joinSession(s.id, { tgId: 3, name: 'Боря' });
    s.startGame('planning-fallacy');
    s.submitAnswer(2, { best: 8, actual: 16 });
    s.submitAnswer(3, { best: 4, actual: 6 });

    // fresh session object from the manager sees the persisted answers
    const s2 = sessionMod.getSession(s.id);
    expect(s2.startGame('planning-fallacy').ok).toBe(true);
    expect(s2.answeredCount()).toBe(2);
  });

  test('toLobby keeps answers so re-entering the game offers them back', () => {
    const s = sessionMod.createSession({ tgId: 1, name: 'Ведущий' });
    sessionMod.joinSession(s.id, { tgId: 2, name: 'Аня' });
    sessionMod.joinSession(s.id, { tgId: 3, name: 'Боря' });
    s.startGame('anchoring');
    s.submitAnswer(2, { anchor: 5, guess: 20 });
    s.toLobby();
    expect(s.phase).toBe('lobby');
    s.startGame('anchoring');
    expect(s.answeredCount()).toBe(1);
  });
});

describe('auth', () => {
  test('dev envelope works without a bot token; garbage is rejected', () => {
    const u = validateInitData(JSON.stringify({ dev: true, user: { name: 'Тест' } }));
    expect(u.name).toBe('Тест');
    expect(u.username).toBe('');
    expect(Number.isInteger(u.tgId)).toBe(true);
    // same name → same id; different names → different ids
    expect(validateInitData(JSON.stringify({ dev: true, user: { name: 'Тест' } })).tgId).toBe(
      u.tgId,
    );
    expect(validateInitData(JSON.stringify({ dev: true, user: { name: 'Другой' } })).tgId).not.toBe(
      u.tgId,
    );
    expect(validateInitData('not-json')).toBeNull();
    expect(validateInitData(JSON.stringify({ user: { name: 'X' } }))).toBeNull();
  });
});

describe('Этап 2 declarations: pairs, groups, dispatch', () => {
  const four = ['Аня', 'Боря', 'Вера', 'Гоша'].map((name, i) => ({ tgId: i + 1, name }));

  test('ultimatum: roles swap between rounds; complete needs all four values', () => {
    const g = getGame('ultimatum');
    const assignment = g.assignment(four);
    expect(assignment.pairs).toHaveLength(2);
    const [p] = assignment.pairs;

    // round 0: a proposes; round 1: a answers
    const r0 = g.validateRound({ r1_offer: 400 }, 0, { me: p.a, assignment }, {});
    expect(r0.ok).toBe(true);
    const r1 = g.validateRound({ r2_min: 300 }, 1, { me: p.a, assignment }, r0.patch);
    expect(r1.ok).toBe(true);
    // same person, other round, wrong key → rejected as missing
    expect(g.validateRound({ r1_offer: 1 }, 1, { me: p.a, assignment }, {}).ok).toBe(false);
    // clamp to stake
    const big = g.validateRound({ r1_offer: 99999 }, 0, { me: p.a, assignment }, {});
    expect(big.patch.r1_offer).toBe(1000);

    const named = [
      { tgId: 1, name: p.a, payload: { r1_offer: 400, r2_min: 300 } },
      { tgId: 2, name: p.b, payload: { r1_min: 350, r2_offer: 500 } },
    ];
    expect(g.complete(named, assignment)).toBe(false); // only one pair filled
    const byName = new Map(four.map((f) => [f.name, f]));
    const namedAll = assignment.pairs.flatMap((pair) => [
      { tgId: byName.get(pair.a).tgId, name: pair.a, payload: { r1_offer: 400, r2_min: 300 } },
      { tgId: byName.get(pair.b).tgId, name: pair.b, payload: { r1_min: 350, r2_offer: 500 } },
    ]);
    expect(g.complete(namedAll, assignment)).toBe(true);
    const res = g.compute(namedAll, assignment);
    expect(res.instances).toBe(4); // 2 пары × 2 раунда
    expect(res.deals).toBe(4); // везде предложение ≥ минимума
    expect(g.headline(res)).toBe('100%');
  });

  test('prisoners-dilemma: per-round choices feed src/logic', () => {
    const g = getGame('prisoners-dilemma');
    const assignment = g.assignment(four);
    const [p] = assignment.pairs;
    const namedAll = assignment.pairs.flatMap((pair) => [
      { tgId: 1, name: pair.a, payload: { r1_choice: 'C', r2_choice: 'C' } },
      { tgId: 2, name: pair.b, payload: { r1_choice: 'C', r2_choice: 'D' } },
    ]);
    expect(g.complete(namedAll, assignment)).toBe(true);
    const res = g.compute(namedAll, assignment);
    expect(res.coopR1).toBe(100);
    expect(res.coopR2).toBe(50);
    expect(g.headline(res)).toContain('100% → 50%');
    expect(g.validateRound({ r1_choice: 'X' }, 0, { me: p.a, assignment }, {}).ok).toBe(false);
  });

  test('endowment: groups, roles, per-lot prices via src/logic', () => {
    const g = getGame('endowment');
    const assignment = g.assignment(four);
    expect(assignment.groupA.length + assignment.groupB.length).toBe(4);
    const owner = assignment.groupA[0];
    const fields = g.fieldsFor(0, { me: owner, assignment });
    expect(fields).toHaveLength(3);
    expect(fields[0].label).toContain('Минимум');
    const buyer = assignment.groupB[0];
    expect(g.fieldsFor(0, { me: buyer, assignment })[0].label).toContain('Максимум');

    const named = four.map((f) => ({
      tgId: f.tgId,
      name: f.name,
      payload: {
        prices:
          assignment.groupA[0] === f.name || assignment.groupA[1] === f.name
            ? [600, 1_400_000, 10_000_000]
            : [400, 1_200_000, 8_000_000],
      },
    }));
    expect(g.complete(named, assignment)).toBe(true);
    const res = g.compute(named, assignment);
    expect(res.filled).toBe(4);
    expect(Number(res.ratio)).toBeGreaterThan(1);
    expect(g.roster(assignment).kind).toBe('groups');
  });

  test('hidden-profile: dispatch reuses the offline dossier text', () => {
    const g = getGame('hidden-profile');
    const t0 = g.dispatchText('Аня', 0, null);
    const t1 = g.dispatchText('Боря', 1, null);
    expect(t0).toContain('досье №1');
    expect(t1).toContain('досье №2');
    expect(t0).not.toBe(t1);

    const named = four.map((f) => ({ tgId: f.tgId, name: f.name, payload: { vote: 'zhenya' } }));
    expect(g.complete(named, null)).toBe(true);
    const res = g.compute(named, null);
    expect(res.soloVotes.zhenya).toBe(4);
    expect(res.foundBest).toBe(true);
    expect(g.headline(res)).toBe('Женя');

    // sweep for the FIRST candidate must not break the winner reduce
    const allSasha = four.map((f) => ({ tgId: f.tgId, name: f.name, payload: { vote: 'sasha' } }));
    expect(g.headline(g.compute(allSasha, null))).toBe('Саша');
    expect(g.compute(allSasha, null).foundBest).toBe(false);
  });
});

describe('Этап 2 session: rounds, timer, dispatch', () => {
  const addFour = (s) => {
    sessionMod.joinSession(s.id, { tgId: 2, name: 'Аня' });
    sessionMod.joinSession(s.id, { tgId: 3, name: 'Боря' });
    sessionMod.joinSession(s.id, { tgId: 4, name: 'Вера' });
    sessionMod.joinSession(s.id, { tgId: 5, name: 'Гоша' });
  };

  test('ultimatum flow: assignment → r1 → advance → r2 → reveal; restart resets round', () => {
    const s = sessionMod.createSession({ tgId: 1, name: 'Ведущий' });
    addFour(s);
    expect(s.startGame('ultimatum').ok).toBe(true);
    expect(s.assignment.pairs).toHaveLength(2);
    expect(s.round).toBe(0);
    // тот же состав при повторном входе (хранится в meta)
    const assignment = s.assignment;
    s.toLobby();
    s.startGame('ultimatum');
    expect(s.assignment).toEqual(assignment);

    // участники отвечают по роли раунда 0
    for (const p of s.participants()) {
      const pair = assignment.pairs.find((x) => x.a === p.name || x.b === p.name);
      const isA = pair.a === p.name;
      expect(
        s.submitAnswer(p.tgId, { r1_offer: isA ? 400 : undefined, r1_min: isA ? undefined : 350 })
          .ok,
      ).toBe(true);
    }
    expect(s.advance().ok).toBe(true);
    expect(s.round).toBe(1);
    // reveal заблокирован, пока нет второго раунда
    expect(s.reveal().ok).toBe(false);
    for (const p of s.participants()) {
      const pair = assignment.pairs.find((x) => x.a === p.name || x.b === p.name);
      const isA = pair.a === p.name;
      expect(
        s.submitAnswer(p.tgId, { r2_min: isA ? 300 : undefined, r2_offer: isA ? undefined : 500 })
          .ok,
      ).toBe(true);
    }
    expect(s.reveal().ok).toBe(true);
    expect(s.results.instances).toBe(4);

    s.back();
    expect(s.restart().ok).toBe(true);
    expect(s.round).toBe(0);
    expect(s.answers).toHaveLength(0);
    expect(s.assignment).toEqual(assignment); // пары переживают рестарт
  });

  test('trio: odd headcount still pairs everyone', () => {
    const s = sessionMod.createSession({ tgId: 1, name: 'Ведущий' });
    addFour(s);
    sessionMod.joinSession(s.id, { tgId: 6, name: 'Даша' });
    s.startGame('ultimatum');
    expect(s.assignment.trio).toHaveLength(3);
    expect(s.assignment.pairs.length).toBe(4); // 1 обычная пара + треугольник из 3 пар
  });

  test('duplicate names get a suffix so pairs stay readable', () => {
    const s = sessionMod.createSession({ tgId: 1, name: 'Ведущий' });
    sessionMod.joinSession(s.id, { tgId: 2, name: 'Аня' });
    sessionMod.joinSession(s.id, { tgId: 3, name: 'Аня', username: 'anya' });
    const names = s.players.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('timer: advisory countdown state', () => {
    const s = sessionMod.createSession({ tgId: 1, name: 'Ведущий' });
    addFour(s);
    s.startGame('ultimatum');
    expect(s.startTimer().ok).toBe(true);
    const t = s.timerState();
    expect(t.state).toBe('running');
    expect(t.remaining).toBeGreaterThan(50);
  });

  test('dispatch: texts go through the sender; items returned either way', async () => {
    const s = sessionMod.createSession({ tgId: 1, name: 'Ведущий' });
    addFour(s);
    s.startGame('hidden-profile');
    const sent = [];
    const result = await s.dispatch(async (tgId, text) => {
      sent.push({ tgId, text });
      return true;
    });
    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(4);
    expect(sent).toHaveLength(4);
    expect(sent[0].text).toContain('досье');
    // без sender (нет бота) пункты возвращаются с delivered=false
    const bare = await s.dispatch(null);
    expect(bare.ok).toBe(true);
    expect(bare.items.every((i) => !i.delivered)).toBe(true);
    // в solo-играх раздавать нечего
    const s2 = sessionMod.createSession({ tgId: 1, name: 'Ведущий' });
    addFour(s2);
    s2.startGame('anchoring');
    expect((await s2.dispatch(null)).ok).toBe(false);
  });
});

describe('profile integration: name, avatar, rename', () => {
  test('auth takes photo_url only as a safe https URL', async () => {
    // no BOT_TOKEN → dev envelope; avatarUrl passes the same safety check
    const dev = (user) => JSON.stringify({ dev: true, user });
    const { validateInitData } = await import('../../server/auth.js');
    expect(
      validateInitData(dev({ name: 'Аня', avatarUrl: 'https://cdn.org/a.jpg' })).avatarUrl,
    ).toBe('https://cdn.org/a.jpg');
    expect(
      validateInitData(dev({ name: 'Аня', avatarUrl: 'http://insecure/a.jpg' })).avatarUrl,
    ).toBe('');
    expect(validateInitData(dev({ name: 'Аня', avatarUrl: 'javascript:alert(1)' })).avatarUrl).toBe(
      '',
    );
  });

  test('avatar is stored per player and survives restore', () => {
    const s = sessionMod.createSession({ tgId: 1, name: 'Ведущий' });
    sessionMod.joinSession(s.id, {
      tgId: 2,
      name: 'Аня',
      avatarUrl: 'https://cdn.org/a.jpg',
    });
    expect(s.player(2).avatarUrl).toBe('https://cdn.org/a.jpg');
    const s2 = sessionMod.getSession(s.id);
    expect(s2.player(2).avatarUrl).toBe('https://cdn.org/a.jpg');
  });

  test('rename: participant self, facilitator anyone, uniqueness kept', () => {
    const s = sessionMod.createSession({ tgId: 1, name: 'Ведущий' });
    sessionMod.joinSession(s.id, { tgId: 2, name: 'Аня' });
    sessionMod.joinSession(s.id, { tgId: 3, name: 'Боря' });

    expect(s.renamePlayer(2, '  Анна   Петровна ').ok).toBe(true);
    expect(s.player(2).name).toBe('Анна Петровна');
    expect(s.renamePlayer(2, '').ok).toBe(false);
    // a taken name gets a suffix, its owner keeps it as-is
    expect(s.renamePlayer(3, 'Анна Петровна').ok).toBe(true);
    expect(s.player(3).name).not.toBe('Анна Петровна');
    expect(s.player(2).name).toBe('Анна Петровна');
    // unknown tgId
    expect(s.renamePlayer(999, 'Х').ok).toBe(false);
    // restored session sees the rename
    expect(sessionMod.getSession(s.id).player(2).name).toBe('Анна Петровна');
  });
});

describe('Этап 3 declarations: anonymous, recaps, market', () => {
  const four = ['Аня', 'Боря', 'Вера', 'Гоша'].map((name, i) => ({ tgId: i + 1, name }));

  test('dictator & public-goods are anonymous with two rounds', () => {
    for (const id of ['dictator', 'public-goods']) {
      const g = getGame(id);
      expect(g.anonymous).toBe(true);
      expect(g.rounds).toBe(2);
      expect(g.fieldsFor(0, { me: 'Аня' })[0].key).toBe('r1');
      expect(g.fieldsFor(1, { me: 'Аня' })[0].key).toBe('r2');
    }
  });

  test('public-goods recap summarizes round 1 for the room', () => {
    const g = getGame('public-goods');
    const named = four.map((f) => ({ tgId: f.tgId, name: f.name, payload: { r1: 50, r2: 20 } }));
    const recap = g.recap(1, named);
    expect(recap.length).toBe(3);
    expect(recap[0]).toContain('50.0 из 100');
    const res = g.compute(named);
    expect(res.avgR1).toBe(50);
    expect(res.avgR2).toBe(20);
    expect(res.delta).toBe(-30);
  });

  test('weakest-link: five effort rounds via src/logic, recap grows per round', () => {
    const g = getGame('weakest-link');
    expect(g.rounds).toBe(5);
    const named = four.map((f, i) => ({
      tgId: f.tgId,
      name: f.name,
      payload: { r1: 7, r2: 7, r3: 6, r4: 7, r5: [2, 7, 7, 7][i] },
    }));
    expect(g.complete(named, null)).toBe(true);
    const recap = g.recap(3, named);
    expect(recap).toHaveLength(3);
    expect(recap[0]).toContain('минимум 7');
    const res = g.compute(named);
    expect(res.minByRound[4]).toBe(2); // последний раунд решил «2»
    expect(res.talkEffect).toBe(1); // после разговора (раунд 4) минимум вырос 6→7
  });

  test('el-farol: capacity is 60%, recap reports evenings', () => {
    const g = getGame('el-farol');
    expect(g.rounds).toBe(8);
    // first two go on evenings 1–2, the rest stay home — never crowded
    const named = four.map((f, i) => ({
      tgId: f.tgId,
      name: f.name,
      payload: Object.fromEntries(
        Array.from({ length: 8 }, (_, e) => [`e${e + 1}`, i < 2 && e < 2 ? 'go' : 'stay']),
      ),
    }));
    expect(g.complete(named, null)).toBe(true);
    const res = g.compute(named);
    expect(res.capacity).toBe(2); // floor(4 × 0.6)
    expect(res.good).toBe(8);
    expect(g.recap(2, named)[0]).toContain('пришло 2 из 4');
  });

  test('lemons: market matching, surplus, sellers-only dispatch', () => {
    const g = getGame('lemons');
    const assignment = {
      sellers: ['Аня', 'Боря'],
      buyers: ['Вера', 'Гоша'],
      qualities: { Аня: 'good', Боря: 'lemon' },
    };
    const named = [
      { tgId: 1, name: 'Аня', payload: { ask: 60 } },
      { tgId: 2, name: 'Боря', payload: { ask: 20 } },
      { tgId: 3, name: 'Вера', payload: { bid: 70 } },
      { tgId: 4, name: 'Гоша', payload: { bid: 25 } },
    ];
    expect(g.complete(named, assignment)).toBe(true);
    const res = g.compute(named, assignment);
    // cheapest ask (lemon, 20) → bid 70; next ask (good, 60) → bid 25 не тянет
    expect(res.trades).toBe(1);
    expect(res.lemonsSold).toBe(1);
    expect(res.surplus).toBe(30 - 20); // ценность лимона для покупателя 30 − цена 20
    expect(g.dispatchText('Аня', 0, assignment)).toContain('хорошая');
    expect(g.dispatchText('Боря', 1, assignment)).toContain('лимон');
    expect(g.dispatchText('Вера', 2, assignment)).toBeNull(); // покупателям не шлём
  });

  test('framing: groups hear swapped wordings per round', () => {
    const g = getGame('framing');
    const assignment = { groupA: ['Аня', 'Боря'], groupB: ['Вера', 'Гоша'] };
    expect(g.fieldsFor(0, { me: 'Аня', assignment })).toHaveLength(1);
    expect(g.myInfo(0, { me: 'Аня', assignment })).toContain('в плюсе');
    expect(g.myInfo(1, { me: 'Аня', assignment })).toContain('в минусе');
    expect(g.myInfo(0, { me: 'Вера', assignment })).toContain('в минусе');
    // gain-рамки: раунд 0 у A, раунд 1 у B — там все надёжны ('1');
    // loss-рамки: раунд 0 у B, раунд 1 у A — там все рискуют ('2')
    const named = [
      { tgId: 1, name: 'Аня', payload: { r1: '1', r2: '2' } },
      { tgId: 2, name: 'Боря', payload: { r1: '1', r2: '2' } },
      { tgId: 3, name: 'Вера', payload: { r1: '2', r2: '1' } },
      { tgId: 4, name: 'Гоша', payload: { r1: '2', r2: '1' } },
    ];
    expect(g.complete(named, assignment)).toBe(true);
    const res = g.compute(named, assignment);
    expect(res.gainRisky).toBe(0);
    expect(res.lossRisky).toBe(100);
  });

  test('barnum: rating required, open answers optional; dispatch carries the text', () => {
    const g = getGame('barnum');
    expect(g.validateRound({ a0: 'утро…', rating: '4' }, 0, {}, g.empty()).ok).toBe(true);
    expect(g.validateRound({ rating: null }, 0, {}, g.empty()).ok).toBe(false);
    expect(g.dispatchText('Аня', 0, null)).toContain('Психологический портрет');
  });
});
