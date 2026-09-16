/* =========================================================
   AnswerTimerController — Lit ReactiveController around logic/timer.js
   =========================================================
   Owns the one-second interval and cleans it up when the host
   disconnects, so a game no longer has to remember a
   clearInterval() in its own disconnectedCallback().

     constructor() { this.timer = new AnswerTimerController(this, 120); }
     render()      { return renderAnswerTimer(this.timer, { runningLabel: '…' }); }

   `clock` is injectable ({ setInterval, clearInterval }) so tests can
   drive ticks by hand instead of waiting real seconds.
========================================================= */
import {
  createTimer,
  isTimerDone,
  resetTimer,
  setTimerDuration,
  startTimer,
  tickTimer,
  timerProgress,
} from '../logic/timer.js';

const REAL_CLOCK = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id),
};

export class AnswerTimerController {
  constructor(host, duration, clock = REAL_CLOCK) {
    this.host = host;
    this.clock = clock;
    this.state = createTimer(duration);
    this._interval = null;
    host.addController(this);
  }

  get duration() {
    return this.state.duration;
  }
  get seconds() {
    return this.state.seconds;
  }
  get running() {
    return this.state.running;
  }
  get done() {
    return isTimerDone(this.state);
  }
  get progress() {
    return timerProgress(this.state);
  }

  // `duration` (seconds) starts this run at a different length than the
  // timer currently has — and keeps it.
  start(duration) {
    this._stopClock();
    this._set(startTimer(this.state, duration));
    this._interval = this.clock.setInterval(() => this._tick(), 1000);
  }

  // Change the length; the timer goes back to idle at the new value. No-op
  // while it is counting down.
  setDuration(seconds) {
    this._set(setTimerDuration(this.state, seconds));
  }

  reset() {
    this._stopClock();
    this._set(resetTimer(this.state));
  }

  hostDisconnected() {
    this._stopClock();
  }

  _tick() {
    this._set(tickTimer(this.state));
    if (!this.state.running) this._stopClock();
  }

  _stopClock() {
    if (this._interval !== null) this.clock.clearInterval(this._interval);
    this._interval = null;
  }

  _set(next) {
    this.state = next;
    this.host.requestUpdate();
  }
}
