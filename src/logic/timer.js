/* =========================================================
   ANSWER TIMER — pure countdown state
   =========================================================
   The manual-start visual countdown ("do something, then time the
   group's discussion"): idle → running → done. No setInterval here —
   AnswerTimerController owns the clock and calls tickTimer() once a
   second — so every transition can be unit-tested instantly.
   Running out is a visual cue only; nothing is disabled or advanced.
========================================================= */

export const createTimer = (duration) => ({ duration, seconds: duration, running: false });

export const startTimer = (timer) => ({ ...timer, seconds: timer.duration, running: true });

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
