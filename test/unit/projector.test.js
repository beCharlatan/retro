// test/unit/projector.test.js
// The projector connection without a browser: the message rules (what a snapshot may contain)
// and ProjectorLink's handshake, driven with fake windows.
import { describe, expect, test } from 'bun:test';
import { chartAspect, fitScale } from '../../src/projector/fit.js';
import { ProjectorLink } from '../../src/projector/link.js';
import {
  CHANNEL,
  helloMessage,
  isProjectorMessage,
  normalizeRoster,
  normalizeSnapshot,
  safeAccentStyle,
  snapshotMessage,
} from '../../src/projector/protocol.js';

// ---- fakes ----

function fakeWindow(extra = {}) {
  const win = {
    closed: false,
    focused: 0,
    posted: [],
    opener: null,
    focus() {
      win.focused++;
    },
    postMessage(data, target) {
      win.posted.push({ data, target });
    },
    ...extra,
  };
  return win;
}

function makeLink({ blocked = false } = {}) {
  const listeners = [];
  const self = {
    addEventListener: (type, fn) => type === 'message' && listeners.push(fn),
  };
  const popup = fakeWindow();
  const opened = [];
  const link = new ProjectorLink({
    self,
    open: (...args) => {
      opened.push(args);
      return blocked ? null : popup;
    },
    url: 'file:///app/index.html?view=projector',
  });
  const deliver = (data, source) => {
    for (const fn of listeners) fn({ data, source });
  };
  return { link, self, popup, opened, deliver };
}

const GAME = {
  kind: 'game',
  gameId: 'availability',
  gameName: 'Эвристика доступности',
  accent: '--game-accent:#f4a300;--game-accent-deep:#8f5f00',
  step: { index: 1, total: 7, title: 'Вопрос 1' },
  timer: { seconds: 12, duration: 20, state: 'running', label: 'на ответ' },
  blocks: [{ role: 'title', html: '<h2>Вопрос?</h2>' }],
};

// ---- protocol ----

describe('isProjectorMessage', () => {
  test('accepts only our channel, version and type', () => {
    expect(isProjectorMessage(helloMessage('a:1'), 'hello')).toBe(true);
    expect(isProjectorMessage(helloMessage('a:1'), 'snapshot')).toBe(false);
    expect(isProjectorMessage({ ...helloMessage('a:1'), channel: 'other' }, 'hello')).toBe(false);
    expect(isProjectorMessage({ ...helloMessage('a:1'), v: 99 }, 'hello')).toBe(false);
    for (const junk of [null, undefined, 'hello', 42, []]) {
      expect(isProjectorMessage(junk, 'hello')).toBe(false);
    }
  });
  test('messages carry the channel', () => {
    expect(snapshotMessage(GAME, 'r:2').channel).toBe(CHANNEL);
  });
});

describe('safeAccentStyle', () => {
  test('lets the game accent variables through', () => {
    const style =
      '--game-accent:#f4a300;--game-accent-deep:#8f5f00;--game-accent-fill:#f4a300;--game-accent-on:#1f1b2e';
    expect(safeAccentStyle(style)).toBe(`${style};`);
  });
  test('rejects anything that is not a custom property with a plain colour', () => {
    for (const bad of [
      'position:fixed',
      '--a:#fff;position:fixed;top:0',
      '--a:url(https://evil.example/x.png)',
      '--a:expression(alert(1))',
      '--a:#fff;background:red',
      '--a:red"onload="x',
    ]) {
      expect(safeAccentStyle(bad)).toBe('');
    }
    expect(safeAccentStyle(undefined)).toBe('');
    expect(safeAccentStyle(42)).toBe('');
  });
});

describe('normalizeSnapshot', () => {
  test('a good game snapshot survives intact', () => {
    const s = normalizeSnapshot(GAME);
    expect(s.kind).toBe('game');
    expect(s.step).toEqual(GAME.step);
    expect(s.timer).toEqual(GAME.timer);
    expect(s.blocks).toEqual(GAME.blocks);
    expect(s.accent).toContain('--game-accent:#f4a300');
  });

  test('idle stays idle; junk becomes nothing', () => {
    expect(normalizeSnapshot({ kind: 'idle' })).toEqual({
      kind: 'idle',
      participants: [],
      people: [],
    });
    expect(
      normalizeSnapshot({
        kind: 'idle',
        participants: ['Анна', 5, 'Борис'],
        people: ['Анна', 'Борис', 'Вера'],
      }),
    ).toEqual({
      kind: 'idle',
      participants: ['Анна', 'Борис'],
      people: ['Анна', 'Борис', 'Вера'],
    });
    for (const junk of [null, undefined, 'x', 3, {}, { kind: 'other' }, { kind: 'game' }]) {
      expect(normalizeSnapshot(junk)).toBeNull();
    }
  });

  test('a snapshot without a step is rejected', () => {
    expect(normalizeSnapshot({ ...GAME, step: undefined })).toBeNull();
    expect(normalizeSnapshot({ ...GAME, step: { index: -1, total: 3, title: 'x' } })).toBeNull();
    expect(normalizeSnapshot({ ...GAME, step: { index: 1.5, total: 3, title: 'x' } })).toBeNull();
  });

  test('timer: validated, seconds floored and never negative, no timer is fine', () => {
    expect(normalizeSnapshot({ ...GAME, timer: null }).timer).toBeNull();
    expect(
      normalizeSnapshot({ ...GAME, timer: { ...GAME.timer, seconds: -4 } }).timer.seconds,
    ).toBe(0);
    expect(
      normalizeSnapshot({ ...GAME, timer: { ...GAME.timer, seconds: 7.9 } }).timer.seconds,
    ).toBe(7);
    expect(normalizeSnapshot({ ...GAME, timer: { ...GAME.timer, duration: 0 } })).toBeNull();
    expect(normalizeSnapshot({ ...GAME, timer: { ...GAME.timer, state: 'paused' } })).toBeNull();
    expect(normalizeSnapshot({ ...GAME, timer: { ...GAME.timer, seconds: 'soon' } })).toBeNull();
  });

  test('blocks with an unknown role or non-string html are dropped, the rest kept', () => {
    const s = normalizeSnapshot({
      ...GAME,
      blocks: [
        { role: 'title', html: '<h2>ok</h2>' },
        { role: 'script', html: '<script>alert(1)</script>' },
        { role: 'body', html: 42 },
        null,
        { role: 'chart', html: '<svg></svg>' },
      ],
    });
    expect(s.blocks.map((b) => b.role)).toEqual(['title', 'chart']);
  });

  test('unknown extra fields are not carried over', () => {
    const s = normalizeSnapshot({ ...GAME, entries: [{ name: 'Анна', answer: 5 }], secret: 'x' });
    expect(Object.keys(s).sort()).toEqual([
      'accent',
      'blocks',
      'entries',
      'gameId',
      'gameName',
      'kind',
      'people',
      'roster',
      'step',
      'timer',
    ]);
  });
});

describe('fitScale', () => {
  test('is limited by the tighter of width and height', () => {
    expect(fitScale(900, 400, 1800, 1000)).toBeCloseTo(2, 5); // width-bound
    expect(fitScale(900, 1000, 1800, 500)).toBeCloseTo(0.5, 5); // height-bound
  });
  test('never goes below the floor or above the ceiling', () => {
    expect(fitScale(900, 10000, 900, 100)).toBeGreaterThanOrEqual(0.3);
    expect(fitScale(100, 100, 10000, 10000)).toBeLessThanOrEqual(2.6);
  });
  test('falls back to 1 while nothing has been measured', () => {
    expect(fitScale(0, 0, 1000, 700)).toBe(1);
    expect(fitScale(900, 500, 0, 0)).toBe(1);
  });
});

describe('normalizeRoster', () => {
  const groups = {
    kind: 'groups',
    title: 'Состав групп',
    groups: [
      { label: 'Группа А', tone: 'a', names: ['Анна', 'Борис'] },
      { label: 'Группа Б', tone: 'b', names: ['Вера'] },
    ],
  };
  const pairs = {
    kind: 'pairs',
    title: 'Кто с кем',
    pairs: [
      { a: 'Анна', b: 'Борис', tagA: 'Предлагающий', tagB: 'Отвечающий' },
      { a: 'Вера', b: 'Глеб', trio: true },
    ],
  };

  test('groups and pairs survive; missing tags become empty, trio is a strict boolean', () => {
    expect(normalizeRoster(groups)).toEqual(groups);
    const r = normalizeRoster(pairs);
    expect(r.pairs[0]).toEqual({
      a: 'Анна',
      b: 'Борис',
      tagA: 'Предлагающий',
      tagB: 'Отвечающий',
      trio: false,
    });
    expect(r.pairs[1]).toEqual({ a: 'Вера', b: 'Глеб', tagA: '', tagB: '', trio: true });
    expect(
      normalizeRoster({ ...pairs, pairs: [{ a: 'x', b: 'y', trio: 'yes' }] }).pairs[0].trio,
    ).toBe(false);
  });

  test('junk gives no roster', () => {
    for (const bad of [
      null,
      undefined,
      'x',
      {},
      { kind: 'groups' },
      { kind: 'other', title: 't' },
      { kind: 'groups', title: 't', groups: [] },
      { kind: 'pairs', title: 't', pairs: [{ a: 1, b: 2 }] },
    ]) {
      expect(normalizeRoster(bad)).toBeNull();
    }
  });

  test('non-string names are dropped, the number and length of names are capped', () => {
    const r = normalizeRoster({
      kind: 'groups',
      title: 't',
      groups: [
        {
          label: 'A',
          names: [
            'ok',
            42,
            null,
            'x'.repeat(500),
            ...Array.from({ length: 200 }, (_, i) => `n${i}`),
          ],
        },
      ],
    });
    expect(r.groups[0].names).toHaveLength(60);
    expect(r.groups[0].names[0]).toBe('ok');
    expect(r.groups[0].names.every((n) => typeof n === 'string' && n.length <= 120)).toBe(true);
  });

  test('an unknown tone becomes "a"; at most six groups', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      label: `G${i}`,
      tone: 'zzz',
      names: ['a'],
    }));
    const r = normalizeRoster({ kind: 'groups', title: 't', groups: many });
    expect(r.groups).toHaveLength(6);
    expect(r.groups.every((g) => g.tone === 'a')).toBe(true);
  });

  test('a snapshot carries the roster through, and drops a broken one without failing', () => {
    expect(normalizeSnapshot({ ...GAME, roster: groups }).roster).toEqual(groups);
    expect(normalizeSnapshot({ ...GAME, roster: { kind: 'groups' } }).roster).toBeNull();
    expect(normalizeSnapshot(GAME).roster).toBeNull();
  });
});

describe('chartAspect', () => {
  test('reads the viewBox', () => {
    expect(chartAspect('<svg viewBox="0 0 640 260"></svg>')).toBeCloseTo(0.406, 2);
    expect(
      chartAspect('<div class="x"><svg class="d3" viewBox="0 0 640 400"></svg></div>'),
    ).toBeCloseTo(0.625, 3);
  });
  test('is 1 when there is none', () => {
    expect(chartAspect('<svg></svg>')).toBe(1);
    expect(chartAspect('')).toBe(1);
  });
});

// ---- link ----

describe('ProjectorLink', () => {
  test('open() opens the named popup, focuses it, and reports blocking', () => {
    const a = makeLink();
    expect(a.link.open()).toBe(true);
    expect(a.opened[0][0]).toBe('file:///app/index.html?view=projector');
    expect(a.opened[0][1]).toBe('retro-projector');
    expect(a.popup.focused).toBe(1);
    expect(a.link.status).toBe('open');

    const b = makeLink({ blocked: true });
    expect(b.link.open()).toBe(false);
    expect(b.link.status).toBe('closed');
  });

  test('publish() sends the snapshot to an open projector, with the current revision', () => {
    const { link, popup } = makeLink();
    link.open();
    link.publish(GAME);
    expect(popup.posted).toHaveLength(1);
    const { data, target } = popup.posted[0];
    expect(target).toBe('*'); // a file:// page has no origin to name
    expect(isProjectorMessage(data, 'snapshot')).toBe(true);
    expect(data.snapshot).toEqual(GAME);
    expect(data.rev).toBe(link.rev);
  });

  test('every publish gets a new revision', () => {
    const { link } = makeLink();
    const first = link.rev;
    link.publish(GAME);
    expect(link.rev).not.toBe(first);
  });

  test('publish() with no projector open only remembers the picture', () => {
    const { link, popup } = makeLink();
    link.publish(GAME);
    expect(popup.posted).toHaveLength(0);
    expect(link.snapshot).toEqual(GAME);
  });

  test('a hello from the popup gets the latest picture when its revision is out of date', () => {
    const { link, popup, deliver } = makeLink();
    link.open();
    link.publish(GAME);
    popup.posted.length = 0;
    deliver(helloMessage(null), popup);
    expect(popup.posted).toHaveLength(1);
    expect(popup.posted[0].data.snapshot).toEqual(GAME);
  });

  test('a hello that already has the current revision is not answered (no resend every few seconds)', () => {
    const { link, popup, deliver } = makeLink();
    link.open();
    link.publish(GAME);
    popup.posted.length = 0;
    deliver(helloMessage(link.rev), popup);
    expect(popup.posted).toHaveLength(0);
  });

  test('a window we did not open is ignored — unless its opener is this window (this page was reloaded)', () => {
    const { link, self, deliver } = makeLink();
    link.publish(GAME);

    const stranger = fakeWindow();
    deliver(helloMessage(null), stranger);
    expect(stranger.posted).toHaveLength(0);
    expect(link.status).toBe('closed');

    const orphan = fakeWindow({ opener: self });
    deliver(helloMessage(null), orphan);
    expect(orphan.posted).toHaveLength(1);
    expect(link.status).toBe('open');
  });

  test('messages that are not projector hellos are ignored', () => {
    const { link, popup, deliver } = makeLink();
    link.open();
    link.publish(GAME);
    popup.posted.length = 0;
    deliver({ hello: true }, popup);
    deliver(snapshotMessage(GAME, 'x'), popup);
    deliver('hello', popup);
    deliver(null, popup);
    deliver(helloMessage(null), null);
    expect(popup.posted).toHaveLength(0);
  });

  test('a closed projector is not written to, and check() reports the change once', () => {
    const { link, popup } = makeLink();
    const seen = [];
    link.onChange((s) => seen.push(s));
    link.open();
    expect(seen).toEqual(['open']);
    popup.closed = true;
    link.publish(GAME);
    expect(popup.posted).toHaveLength(0);
    link.check();
    link.check();
    expect(seen).toEqual(['open', 'closed']);
  });

  test('a popup that throws on postMessage does not break publish()', () => {
    const { link, popup } = makeLink();
    link.open();
    popup.postMessage = () => {
      throw new Error('gone');
    };
    expect(() => link.publish(GAME)).not.toThrow();
  });

  test('onChange returns an unsubscribe function', () => {
    const { link } = makeLink();
    const seen = [];
    const off = link.onChange((s) => seen.push(s));
    off();
    link.open();
    expect(seen).toEqual([]);
  });
});
