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
import { RoundTimers } from '../../src/controllers/round-timers.js';
import { SpoilerController } from '../../src/controllers/spoiler-controller.js';

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

  test('start(duration) runs this time at a different length and keeps it', () => {
    const clock = fakeClock();
    const timer = new AnswerTimerController(fakeHost(), 20, clock);
    timer.start(45);
    expect(timer.duration).toBe(45);
    expect(timer.seconds).toBe(45);
    clock.fire();
    expect(timer.seconds).toBe(44);
    timer.reset();
    expect(timer.seconds).toBe(45); // reset returns to the (new) length
  });

  test('setDuration changes the length while idle and asks the host to re-render', () => {
    const host = fakeHost();
    const timer = new AnswerTimerController(host, 20, fakeClock());
    const before = host.updates;
    timer.setDuration(90);
    expect(timer.duration).toBe(90);
    expect(timer.seconds).toBe(90);
    expect(timer.running).toBe(false);
    expect(host.updates).toBeGreaterThan(before);
  });

  test('setDuration is ignored while counting down', () => {
    const clock = fakeClock();
    const timer = new AnswerTimerController(fakeHost(), 20, clock);
    timer.start();
    clock.fire();
    timer.setDuration(90);
    expect(timer.duration).toBe(20);
    expect(timer.seconds).toBe(19);
    expect(timer.running).toBe(true);
  });

  test('setDuration after the timer ran out puts it back to idle at the new length', () => {
    const clock = fakeClock();
    const timer = new AnswerTimerController(fakeHost(), 5, clock);
    timer.start();
    for (let i = 0; i < 5; i++) clock.fire();
    expect(timer.done).toBe(true);
    timer.setDuration(30);
    expect(timer.done).toBe(false);
    expect(timer.seconds).toBe(30);
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

describe('RoundTimers', () => {
  const make = (count = 3, seconds = 20) => {
    const host = fakeHost();
    const clock = fakeClock();
    const timers = new RoundTimers(host, { seconds, count, clock });
    return { host, clock, timers };
  };

  test('every round starts at the default length, none is live', () => {
    const { timers } = make(3, 20);
    expect(timers.durations).toEqual([20, 20, 20]);
    expect(timers.active).toBeNull();
    expect(timers.timer.running).toBe(false);
  });

  test('start runs one round at its own length and marks it live', () => {
    const { timers, clock } = make();
    timers.setDuration(1, 45);
    timers.start(1);
    expect(timers.active).toBe(1);
    expect(timers.timer.running).toBe(true);
    expect(timers.timer.seconds).toBe(45);
    expect(clock.active).toBe(1);
  });

  test('starting another round replaces the running countdown', () => {
    const { timers, clock } = make();
    timers.start(0);
    timers.start(2);
    expect(timers.active).toBe(2);
    expect(clock.active).toBe(1);
  });

  test('reset stops the clock, clears the live round and asks the host to redraw', () => {
    const { timers, clock, host } = make();
    timers.start(0);
    const before = host.updates;
    timers.reset();
    expect(timers.active).toBeNull();
    expect(timers.timer.running).toBe(false);
    expect(clock.active).toBe(0);
    expect(host.updates).toBeGreaterThan(before);
  });

  test('a length set for a round that is not live only changes that round', () => {
    const { timers } = make();
    timers.start(0);
    timers.setDuration(2, 90);
    expect(timers.durations).toEqual([20, 20, 90]);
    expect(timers.timer.duration).toBe(20);
  });

  test('a length set for the live, idle round is applied to the timer too', () => {
    const { timers } = make();
    timers.active = 1; // live but idle: the person has focused it, not started it
    timers.setDuration(1, 60);
    expect(timers.timer.seconds).toBe(60);
  });

  test('setDuration never mutates the previous array (Lit compares by identity)', () => {
    const { timers } = make();
    const before = timers.durations;
    timers.setDuration(0, 30);
    expect(timers.durations).not.toBe(before);
    expect(before).toEqual([20, 20, 20]);
  });

  test('durationOf falls back to the default for rounds it has not seen', () => {
    const { timers } = make(2, 25);
    expect(timers.durationOf(5)).toBe(25);
    timers.setDuration(4, 10); // a custom question added later
    expect(timers.durations).toEqual([25, 25, 25, 25, 10]);
  });

  test('resetAll restores the default lengths for the new question count', () => {
    const { timers } = make(2, 20);
    timers.setDuration(0, 99);
    timers.start(0);
    timers.resetAll(4);
    expect(timers.durations).toEqual([20, 20, 20, 20]);
    expect(timers.active).toBeNull();
    expect(timers.timer.running).toBe(false);
  });

  test('disconnecting the host stops the countdown', () => {
    const { timers, host, clock } = make();
    timers.start(0);
    for (const c of host.controllers) c.hostDisconnected?.();
    expect(clock.active).toBe(0);
  });
});

describe('SpoilerController', () => {
  test('every card starts hidden', () => {
    const s = new SpoilerController(fakeHost(), ['a', 'b']);
    expect(s.isHidden('a')).toBe(true);
    expect(s.isHidden('b')).toBe(true);
  });

  test('toggle flips one card, replaces the map and asks the host to redraw', () => {
    const host = fakeHost();
    const s = new SpoilerController(host, ['a', 'b']);
    const before = s.hidden;
    s.toggle('a');
    expect(s.isHidden('a')).toBe(false);
    expect(s.isHidden('b')).toBe(true);
    expect(s.hidden).not.toBe(before);
    expect(host.updates).toBe(1);
    s.toggle('a');
    expect(s.isHidden('a')).toBe(true);
  });

  test('a key it was not given counts as hidden until toggled', () => {
    const s = new SpoilerController(fakeHost(), []);
    expect(s.isHidden('late')).toBe(true);
    s.toggle('late');
    expect(s.isHidden('late')).toBe(false);
  });

  test('hideAll closes every open card', () => {
    const s = new SpoilerController(fakeHost(), ['a', 'b']);
    s.toggle('a');
    s.toggle('b');
    s.hideAll();
    expect(s.isHidden('a') && s.isHidden('b')).toBe(true);
  });
});

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
    // roundClass() is a lit classMap() directive result for the template
    expect(typeof flowHarness().flow.roundClass(0)).toBe('object');
    const { flow } = flowHarness();
    expect(flow.roundClassMap(0)['round-pending']).toBe(false);
    expect(flow.roundClassMap(1)['round-pending']).toBe(true);
    expect(flow.lock(0)).toBe('');
    expect(flow.lock(1)).not.toBe('');
    await flow.advance(1);
    expect(flow.roundClassMap(1)['round-pending']).toBe(false);
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
