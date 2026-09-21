/* =========================================================
   RoundTimers — one live answer timer for a game with several timed rounds
   =========================================================
   Availability (one card per question), Calibration, Public goods, Endowment
   (one per lot) and Framing (one per scenario) all render a timer card in every
   round but run only ONE countdown at a time, and every round keeps its own
   length (editable while the card is idle). That bookkeeping — which round is
   live, the per-round lengths, resetting between rounds — lives here.

     constructor() { this.timers = new RoundTimers(this, { seconds: 20, count: 4 }); }
     render()      { return html`${this.timers.card(qIdx, { runningLabel: 'на ответ' })}`; }
     _next()       { this.timers.reset(); … }
     _reset()      { this.timers.resetAll(this.questions.length); … }

   `count` may change (Calibration adds a custom question): `durationOf(i)` falls
   back to the default for rounds it hasn't seen.
========================================================= */
import { renderAnswerTimer } from '../game-shell.js';
import { AnswerTimerController } from './answer-timer-controller.js';

export class RoundTimers {
  constructor(host, { seconds, count, clock } = {}) {
    this.host = host;
    this.defaultSeconds = seconds;
    this.timer = new AnswerTimerController(host, seconds, clock);
    this.active = null; // the round whose card is live; the others show idle
    this.durations = Array.from({ length: count }, () => seconds);
  }

  durationOf(round) {
    return this.durations[round] ?? this.defaultSeconds;
  }

  start(round) {
    this.active = round;
    this.timer.start(this.durationOf(round));
  }

  // Back to idle, and no round is live.
  reset() {
    this.timer.reset();
    this.active = null;
    this.host.requestUpdate();
  }

  // A fresh game: idle, every round back at the default length.
  resetAll(count = this.durations.length) {
    this.durations = Array.from({ length: count }, () => this.defaultSeconds);
    this.reset();
  }

  // A new length for `round`. If that round's timer is the live one (idle or
  // finished), it goes back to idle at the new length as well.
  setDuration(round, seconds) {
    const next = this.durations.slice();
    while (next.length <= round) next.push(this.defaultSeconds);
    next[round] = seconds;
    this.durations = next;
    if (this.active === round) this.timer.setDuration(seconds);
    this.host.requestUpdate();
  }

  // The timer card for `round` (renderAnswerTimer's options, minus the wiring).
  card(round, options = {}) {
    return renderAnswerTimer(this.timer, {
      ...options,
      active: this.active === round,
      duration: this.durationOf(round),
      defaultDuration: this.defaultSeconds,
      onDurationChange: (seconds) => this.setDuration(round, seconds),
      onStart: () => this.start(round),
      onReset: () => this.reset(),
    });
  }
}
