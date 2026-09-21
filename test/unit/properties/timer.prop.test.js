// Property tests for src/logic/timer.js
import { describe, expect, test } from 'bun:test';
import {
  clampDuration,
  createTimer,
  formatTimer,
  isTimerDone,
  MAX_DURATION,
  MIN_DURATION,
  nudgeDuration,
  parseDuration,
  setTimerDuration,
  startTimer,
  tickTimer,
  timerProgress,
} from '../../../src/logic/timer.js';
import { fc, int, RUNS } from './helpers.js';

const duration = int(MIN_DURATION, MAX_DURATION);

describe('durations', () => {
  test('clampDuration always lands in range and is idempotent', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, min: -1e9, max: 1e9 }), (x) => {
        const c = clampDuration(x);
        expect(c).toBeGreaterThanOrEqual(MIN_DURATION);
        expect(c).toBeLessThanOrEqual(MAX_DURATION);
        expect(clampDuration(c)).toBe(c);
      }),
      RUNS,
    );
  });

  test('parseDuration(formatTimer(x)) is x for every allowed length', () => {
    fc.assert(
      fc.property(duration, (x) => expect(parseDuration(formatTimer(x))).toBe(x)),
      RUNS,
    );
  });

  test('parseDuration never throws and returns null or an allowed length', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const v = parseDuration(text);
        if (v !== null) {
          expect(v).toBeGreaterThanOrEqual(MIN_DURATION);
          expect(v).toBeLessThanOrEqual(MAX_DURATION);
        }
      }),
      RUNS,
    );
  });

  test('nudging up increases (until the cap), nudging down decreases (until the floor), always in range', () => {
    fc.assert(
      fc.property(duration, (x) => {
        const up = nudgeDuration(x, 1);
        const down = nudgeDuration(x, -1);
        expect(up).toBeGreaterThanOrEqual(x);
        expect(down).toBeLessThanOrEqual(x);
        if (x < MAX_DURATION) expect(up).toBeGreaterThan(x);
        if (x > MIN_DURATION) expect(down).toBeLessThan(x);
        for (const v of [up, down]) {
          expect(v).toBeGreaterThanOrEqual(MIN_DURATION);
          expect(v).toBeLessThanOrEqual(MAX_DURATION);
        }
      }),
      RUNS,
    );
  });

  test('repeated presses always reach both ends of the range', () => {
    fc.assert(
      fc.property(duration, (start) => {
        let v = start;
        for (let i = 0; i < 400 && v < MAX_DURATION; i++) v = nudgeDuration(v, 1);
        expect(v).toBe(MAX_DURATION);
        for (let i = 0; i < 400 && v > MIN_DURATION; i++) v = nudgeDuration(v, -1);
        expect(v).toBe(MIN_DURATION);
      }),
      { numRuns: 50 },
    );
  });
});

describe('countdown', () => {
  test('running for exactly `duration` ticks ends done at 0:00, never below', () => {
    fc.assert(
      fc.property(int(1, 200), (d) => {
        let t = startTimer(createTimer(d));
        for (let i = 0; i < d; i++) {
          expect(t.seconds).toBeGreaterThanOrEqual(0);
          t = tickTimer(t);
        }
        expect(t.seconds).toBe(0);
        expect(isTimerDone(t)).toBe(true);
        // extra ticks change nothing
        expect(tickTimer(t)).toBe(t);
      }),
      RUNS,
    );
  });

  test('progress is always within 0..100 while running', () => {
    fc.assert(
      fc.property(int(1, 200), int(0, 250), (d, ticks) => {
        let t = startTimer(createTimer(d));
        for (let i = 0; i < ticks; i++) t = tickTimer(t);
        const p = timerProgress(t);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThanOrEqual(100);
      }),
      RUNS,
    );
  });

  test('a running timer ignores duration changes, an idle one takes them', () => {
    fc.assert(
      fc.property(duration, duration, (a, b) => {
        const running = startTimer(createTimer(a));
        expect(setTimerDuration(running, b)).toBe(running);
        const idle = setTimerDuration(createTimer(a), b);
        expect(idle.duration).toBe(b);
        expect(idle.seconds).toBe(b);
        expect(idle.running).toBe(false);
      }),
      RUNS,
    );
  });
});

describe('formatTimer', () => {
  test('is always m:ss with two-digit seconds', () => {
    fc.assert(
      fc.property(int(0, 5999), (s) => expect(formatTimer(s)).toMatch(/^\d+:[0-5]\d$/)),
      RUNS,
    );
  });
});
