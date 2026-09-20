// test/unit/timer.test.js — pure countdown state (idle → running → done).
import { describe, expect, test } from 'bun:test';
import {
  createTimer,
  formatTimer,
  isTimerDone,
  isTimerIdle,
  resetTimer,
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
