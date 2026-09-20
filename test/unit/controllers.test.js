// test/unit/controllers.test.js
// The two Lit ReactiveControllers, driven with a fake host and fake
// clocks — no DOM, no real waiting. Covers the part that used to be
// copy-pasted into every game and easy to forget: cleaning up timers
// when the component disconnects.
import { describe, expect, test } from 'bun:test';
import { AnswerTimerController } from '../../src/controllers/answer-timer-controller.js';
import {
  ROUND_COMPLETE_FLASH_MS,
  ROUND_COMPLETE_PAUSE_MS,
  RoundFlowController,
} from '../../src/controllers/round-flow-controller.js';

function fakeHost() {
  const host = {
    controllers: [],
    updates: 0,
    updateComplete: Promise.resolve(true),
    addController(c) {
      host.controllers.push(c);
    },
    requestUpdate() {
      host.updates++;
    },
  };
  return host;
}

// A manual interval clock: tests call `fire()` instead of waiting.
function fakeClock() {
  const clock = {
    handlers: new Map(),
    nextId: 1,
    setInterval(fn) {
      const id = clock.nextId++;
      clock.handlers.set(id, fn);
      return id;
    },
    clearInterval(id) {
      clock.handlers.delete(id);
    },
    get active() {
      return clock.handlers.size;
    },
    fire() {
      for (const fn of [...clock.handlers.values()]) fn();
    },
  };
  return clock;
}

describe('AnswerTimerController', () => {
  test('registers itself with the host', () => {
    const host = fakeHost();
    const timer = new AnswerTimerController(host, 20, fakeClock());
    expect(host.controllers).toContain(timer);
    expect(timer.seconds).toBe(20);
    expect(timer.running).toBe(false);
  });

  test('start ticks down once per interval and asks the host to re-render', () => {
    const host = fakeHost();
    const clock = fakeClock();
    const timer = new AnswerTimerController(host, 3, clock);
    timer.start();
    const afterStart = host.updates;
    expect(timer.running).toBe(true);
    clock.fire();
    expect(timer.seconds).toBe(2);
    expect(host.updates).toBeGreaterThan(afterStart);
  });

  test('runs out: stops the interval by itself and reports done', () => {
    const clock = fakeClock();
    const timer = new AnswerTimerController(fakeHost(), 2, clock);
    timer.start();
    clock.fire();
    clock.fire();
    expect(timer.seconds).toBe(0);
    expect(timer.done).toBe(true);
    expect(timer.running).toBe(false);
    expect(clock.active).toBe(0);
  });

  test('starting again never leaves two intervals running', () => {
    const clock = fakeClock();
    const timer = new AnswerTimerController(fakeHost(), 10, clock);
    timer.start();
    timer.start();
    expect(clock.active).toBe(1);
  });

  test('reset stops the clock and restores the full duration', () => {
    const clock = fakeClock();
    const timer = new AnswerTimerController(fakeHost(), 10, clock);
    timer.start();
    clock.fire();
    timer.reset();
    expect(timer.seconds).toBe(10);
    expect(timer.running).toBe(false);
    expect(clock.active).toBe(0);
  });

  test('disconnecting the host clears the interval (the whole point)', () => {
    const clock = fakeClock();
    const timer = new AnswerTimerController(fakeHost(), 10, clock);
    timer.start();
    timer.hostDisconnected();
    expect(clock.active).toBe(0);
  });

  test('progress reflects the remaining share', () => {
    const clock = fakeClock();
    const timer = new AnswerTimerController(fakeHost(), 4, clock);
    expect(timer.progress).toBe(100);
    timer.start();
    clock.fire();
    expect(timer.progress).toBe(75);
  });
});

function flowHarness(options = {}) {
  const host = fakeHost();
  const calls = [];
  const timeouts = new Map();
  let nextTimeout = 1;
  const flow = new RoundFlowController(host, {
    titles: ['Старт', 'Вопрос', 'Итог'],
    sleep: async (ms) => {
      calls.push(['sleep', ms]);
    },
    scroll: (_host, idx) => {
      calls.push(['scroll', idx]);
    },
    setTimeout: (fn, ms) => {
      const id = nextTimeout++;
      timeouts.set(id, { fn, ms });
      return id;
    },
    clearTimeout: (id) => timeouts.delete(id),
    ...options,
  });
  return { host, flow, calls, timeouts };
}

describe('RoundFlowController', () => {
  test('starts locked at round 0', () => {
    const { flow } = flowHarness();
    expect(flow.screenIdx).toBe(0);
    expect(flow.activeRound).toBe(0);
    expect(flow.justCompletedIdx).toBeNull();
  });

  test('advance: runs the action, unlocks, pauses, then scrolls — in that order', async () => {
    const { flow, calls } = flowHarness();
    let ran = false;
    await flow.advance(1, () => {
      ran = true;
      calls.push(['action']);
    });
    expect(ran).toBe(true);
    expect(flow.screenIdx).toBe(1);
    expect(flow.justCompletedIdx).toBe(0);
    expect(calls).toEqual([['action'], ['sleep', ROUND_COMPLETE_PAUSE_MS], ['scroll', 1]]);
  });

  test('the flash is cleared after ROUND_COMPLETE_FLASH_MS', async () => {
    const { flow, timeouts } = flowHarness();
    await flow.advance(1);
    expect(timeouts.size).toBe(1);
    const [{ fn, ms }] = [...timeouts.values()];
    expect(ms).toBe(ROUND_COMPLETE_FLASH_MS);
    fn();
    expect(flow.justCompletedIdx).toBeNull();
  });

  test('a second advance replaces the pending flash timer instead of stacking', async () => {
    const { flow, timeouts } = flowHarness();
    await flow.advance(1);
    await flow.advance(2);
    expect(timeouts.size).toBe(1);
  });

  test('advance asks the host to re-render', async () => {
    const { flow, host } = flowHarness();
    const before = host.updates;
    await flow.advance(1);
    expect(host.updates).toBeGreaterThan(before);
  });

  test('roundClass / lock follow screenIdx', async () => {
    const { flow } = flowHarness();
    expect(flow.roundClass(0)).not.toContain('round-pending');
    expect(flow.roundClass(1)).toContain('round-pending');
    expect(flow.lock(0)).toBe('');
    expect(flow.lock(1)).not.toBe('');
    await flow.advance(1);
    expect(flow.roundClass(1)).not.toContain('round-pending');
    expect(flow.lock(1)).toBe('');
    expect(flow.lock(2)).not.toBe('');
  });

  test('titles may be a function (calibration builds them from its questions)', () => {
    const { flow } = flowHarness({ titles: () => ['a', 'b', 'c'] });
    const lock = flow.lock(2);
    expect(lock.values).toContain('c');
  });

  test('lock titles come from the titles array', () => {
    const { flow } = flowHarness();
    expect(flow.lock(2).values).toContain('Итог');
  });

  test('scrollTo delegates to the injected scroller', () => {
    const { flow, calls } = flowHarness();
    flow.scrollTo(2);
    expect(calls).toEqual([['scroll', 2]]);
  });

  test('reset goes back to the start and drops the pending flash', async () => {
    const { flow, timeouts } = flowHarness();
    await flow.advance(2);
    flow.reset();
    expect(flow.screenIdx).toBe(0);
    expect(flow.justCompletedIdx).toBeNull();
    expect(timeouts.size).toBe(0);
  });

  test('disconnecting the host clears the pending flash timer', async () => {
    const { flow, timeouts } = flowHarness();
    await flow.advance(1);
    flow.hostDisconnected();
    expect(timeouts.size).toBe(0);
  });
});
