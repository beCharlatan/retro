/* =========================================================
   ANSWER TIMER — pure countdown state
   =========================================================
   The manual-start visual countdown ("do something, then time the
   group's discussion"): idle → running → done. No setInterval here —
   AnswerTimerController owns the clock and calls tickTimer() once a
   second — so every transition can be unit-tested instantly.
   Running out is a visual cue only; nothing is disabled or advanced.
========================================================= */

// The facilitator can change any timer's length; keep it within sane bounds
// (a countdown under 5 s is pointless, over an hour is a typo).
export const MIN_DURATION = 5;
export const MAX_DURATION = 60 * 60;

export const clampDuration = (seconds) =>
  Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(seconds)));

export const createTimer = (duration) => ({ duration, seconds: duration, running: false });

// `duration` overrides the timer's own length for this run (and keeps it).
// Not clamped: callers pass lengths that already came through
// clampDuration / parseDuration / nudgeDuration.
export const startTimer = (timer, duration = timer.duration) => ({
  ...timer,
  duration,
  seconds: duration,
  running: true,
});

// A new length (clamped to MIN..MAX), back at idle. Ignored while the clock is running — changing
// the length under a live countdown would jump the bar.
export function setTimerDuration(timer, duration) {
  if (timer.running) return timer;
  const d = clampDuration(duration);
  return { ...timer, duration: d, seconds: d, running: false };
}

// One step of the − / + buttons: 5 s steps up to a minute, 15 s up to five
// minutes, 30 s beyond — and it snaps to that grid, so 63 s goes to 75 s
// (up) or 60 s (down), not 78 / 48.
export function nudgeDuration(seconds, direction) {
  const reference = direction > 0 ? seconds : seconds - 1;
  const step = reference < 60 ? 5 : reference < 300 ? 15 : 30;
  const next =
    direction > 0
      ? (Math.floor(seconds / step) + 1) * step
      : (Math.ceil(seconds / step) - 1) * step;
  return clampDuration(next);
}

// What a person typed into the length field → seconds, or null if it isn't
// a time. Accepts "90" (seconds), "1:30" (m:ss), "2:00", "1,5" / "1.5" is
// NOT accepted — ambiguous between minutes and seconds.
export function parseDuration(text) {
  const t = String(text ?? '').trim();
  if (/^\d+$/.test(t)) return clampDuration(Number(t));
  const m = /^(\d+):([0-5]?\d)$/.exec(t);
  if (m) return clampDuration(Number(m[1]) * 60 + Number(m[2]));
  return null;
}

export const resetTimer = (timer) => ({ ...timer, seconds: timer.duration, running: false });

export function tickTimer(timer) {
  if (!timer.running) return timer;
  const seconds = Math.max(0, timer.seconds - 1);
  return seconds === 0 ? { ...timer, seconds: 0, running: false } : { ...timer, seconds };
}

export const isTimerDone = (timer) => !timer.running && timer.seconds === 0;

export const isTimerIdle = (timer) => !timer.running && timer.seconds === timer.duration;

// Share of the bar still filled, 0..100.
export const timerProgress = (timer) =>
  timer.duration ? (timer.seconds / timer.duration) * 100 : 0;

export function formatTimer(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
