// test/unit/timer.test.js — pure countdown state (idle → running → done).
import { describe, expect, test } from 'bun:test';
import {
  clampDuration,
  createTimer,
  formatTimer,
  isTimerDone,
  isTimerIdle,
  MAX_DURATION,
  MIN_DURATION,
  nudgeDuration,
  parseDuration,
  resetTimer,
  setTimerDuration,
  startTimer,
  tickTimer,
  timerProgress,
} from '../../src/logic/timer.js';

describe('timer state machine', () => {
  test('starts idle at full duration', () => {
    const t = createTimer(20);
    expect(t).toEqual({ duration: 20, seconds: 20, running: false });
    expect(isTimerIdle(t)).toBe(true);
    expect(isTimerDone(t)).toBe(false);
  });

  test('start → running; ticks count down one second at a time', () => {
    let t = startTimer(createTimer(3));
    expect(t.running).toBe(true);
    t = tickTimer(t);
    expect(t.seconds).toBe(2);
    expect(t.running).toBe(true);
  });

  test('reaching zero stops the timer and marks it done', () => {
    let t = startTimer(createTimer(2));
    t = tickTimer(tickTimer(t));
    expect(t.seconds).toBe(0);
    expect(t.running).toBe(false);
    expect(isTimerDone(t)).toBe(true);
  });

  test('ticking an idle or finished timer does nothing', () => {
    const idle = createTimer(5);
    expect(tickTimer(idle)).toBe(idle);
    const done = { duration: 5, seconds: 0, running: false };
    expect(tickTimer(done)).toBe(done);
  });

  test('reset returns to idle at full duration, from running or done', () => {
    const running = tickTimer(startTimer(createTimer(10)));
    expect(isTimerIdle(resetTimer(running))).toBe(true);
    expect(isTimerIdle(resetTimer({ duration: 10, seconds: 0, running: false }))).toBe(true);
  });

  test('start again after finishing restarts from full duration', () => {
    const done = { duration: 7, seconds: 0, running: false };
    expect(startTimer(done)).toEqual({ duration: 7, seconds: 7, running: true });
  });

  test('transitions never mutate the previous state', () => {
    const t = createTimer(4);
    startTimer(t);
    expect(t.running).toBe(false);
  });
});

describe('timerProgress', () => {
  test('is the remaining share, 0..100', () => {
    expect(timerProgress(createTimer(20))).toBe(100);
    expect(timerProgress({ duration: 20, seconds: 5, running: true })).toBe(25);
    expect(timerProgress({ duration: 20, seconds: 0, running: false })).toBe(0);
  });
  test('a zero-length timer does not divide by zero', () => {
    expect(timerProgress(createTimer(0))).toBe(0);
  });
});

describe('formatTimer', () => {
  test('formats m:ss', () => {
    expect(formatTimer(120)).toBe('2:00');
    expect(formatTimer(20)).toBe('0:20');
    expect(formatTimer(65)).toBe('1:05');
    expect(formatTimer(0)).toBe('0:00');
  });
});

describe('startTimer with a custom length', () => {
  test('starts at the given length and keeps it', () => {
    const t = startTimer(createTimer(20), 45);
    expect(t).toEqual({ duration: 45, seconds: 45, running: true });
  });
  test('without an argument it uses the timer’s own length', () => {
    expect(startTimer(createTimer(20)).duration).toBe(20);
  });
});

describe('clampDuration', () => {
  test('keeps values in range and rounds to whole seconds', () => {
    expect(clampDuration(30)).toBe(30);
    expect(clampDuration(30.6)).toBe(31);
  });
  test('raises tiny values to the minimum and lowers absurd ones to the maximum', () => {
    expect(clampDuration(0)).toBe(MIN_DURATION);
    expect(clampDuration(-10)).toBe(MIN_DURATION);
    expect(clampDuration(99999)).toBe(MAX_DURATION);
  });
});

describe('setTimerDuration', () => {
  test('changes the length and goes back to idle at the new value', () => {
    const t = setTimerDuration(createTimer(20), 90);
    expect(t).toEqual({ duration: 90, seconds: 90, running: false });
    expect(isTimerIdle(t)).toBe(true);
  });
  test('works after the timer has run out (back to idle)', () => {
    const done = { duration: 20, seconds: 0, running: false };
    expect(isTimerIdle(setTimerDuration(done, 30))).toBe(true);
  });
  test('is ignored while the clock is running (the bar must not jump)', () => {
    const running = startTimer(createTimer(20));
    expect(setTimerDuration(running, 60)).toBe(running);
  });
  test('clamps what it is given', () => {
    expect(setTimerDuration(createTimer(20), 1).duration).toBe(MIN_DURATION);
    expect(setTimerDuration(createTimer(20), 1e9).duration).toBe(MAX_DURATION);
  });
});

describe('nudgeDuration (the − / + buttons)', () => {
  test('5 s steps below a minute', () => {
    expect(nudgeDuration(20, 1)).toBe(25);
    expect(nudgeDuration(20, -1)).toBe(15);
  });
  test('15 s steps between one and five minutes', () => {
    expect(nudgeDuration(60, 1)).toBe(75);
    expect(nudgeDuration(120, 1)).toBe(135);
    expect(nudgeDuration(120, -1)).toBe(105);
  });
  test('30 s steps from five minutes up', () => {
    expect(nudgeDuration(300, 1)).toBe(330);
    expect(nudgeDuration(600, -1)).toBe(570);
  });
  test('the step size switches at the boundary in both directions', () => {
    expect(nudgeDuration(60, -1)).toBe(55); // going down from 60 uses 5 s steps
    expect(nudgeDuration(55, 1)).toBe(60);
    expect(nudgeDuration(300, -1)).toBe(285);
  });
  test('an off-grid value snaps to the grid instead of drifting', () => {
    expect(nudgeDuration(63, 1)).toBe(75);
    expect(nudgeDuration(63, -1)).toBe(60);
    expect(nudgeDuration(22, 1)).toBe(25);
    expect(nudgeDuration(22, -1)).toBe(20);
  });
  test('stops at the limits', () => {
    expect(nudgeDuration(MIN_DURATION, -1)).toBe(MIN_DURATION);
    expect(nudgeDuration(MAX_DURATION, 1)).toBe(MAX_DURATION);
  });
  test('repeated presses always make progress', () => {
    let v = 20;
    for (let i = 0; i < 30; i++) {
      const next = nudgeDuration(v, 1);
      expect(next).toBeGreaterThan(v);
      v = next;
    }
    for (let i = 0; i < 80 && v > MIN_DURATION; i++) {
      const next = nudgeDuration(v, -1);
      expect(next).toBeLessThan(v);
      v = next;
    }
    expect(v).toBe(MIN_DURATION);
  });
});

describe('parseDuration (the typeable field)', () => {
  test('plain digits are seconds', () => {
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration(' 45 ')).toBe(45);
  });
  test('m:ss', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('2:00')).toBe(120);
    expect(parseDuration('0:20')).toBe(20);
    expect(parseDuration('10:5')).toBe(605);
  });
  test('seconds part must be under 60', () => {
    expect(parseDuration('1:75')).toBeNull();
  });
  test('anything else is rejected, never guessed', () => {
    for (const bad of ['', '   ', 'abc', '1.5', '1,5', '-20', '1:2:3', ':30', null, undefined]) {
      expect(parseDuration(bad)).toBeNull();
    }
  });
  test('the result is clamped like every other entry point', () => {
    expect(parseDuration('2')).toBe(MIN_DURATION);
    expect(parseDuration('999:00')).toBe(MAX_DURATION);
  });
  test('round-trips with formatTimer', () => {
    for (const s of [5, 20, 65, 120, 605]) expect(parseDuration(formatTimer(s))).toBe(s);
  });
});
