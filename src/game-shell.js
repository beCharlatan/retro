/* =========================================================
   GAME SHELL — shared template pieces for the "one continuous scroll
   past the map" деталка layout, used by all 13 games (see framing.js —
   the original prototype — for the fullest write-up of *why* this
   shape: every round always in the DOM as a plain <section
   class="round">, forward movement gated to a round's own button, a big
   sticky vertical game-trail.js rail that tracks scroll position
   independently of how far the player has actually completed).

   The STATE and behaviour live elsewhere now:

     controllers/round-flow-controller.js  — screenIdx / activeRound /
        justCompletedIdx, advance / scrollTo / reset, scroll tracking
        and their cleanup (pure rules: logic/round-flow.js)
     controllers/answer-timer-controller.js — the manual-start
        countdown and its interval (pure rules: logic/timer.js)

   What remains here is markup and one browser prompt:
     confirmExit(onExit)              — the × in the corner
     renderAnswerTimer(timer, opts)   — the timer card
     renderReveal({...})              — the results-screen headline
========================================================= */
import { html, nothing } from 'lit';
import { formatTimer } from './logic/timer.js';

// The × in the corner (replaces the old .game-crumb back-link) —
// exiting mid-attempt clears the draft same as the old back-link did,
// so it's worth a plain native confirm rather than a silent one-click
// exit. No modal component exists in this app, and a native one is
// the cheapest correct answer for a single yes/no with real stakes.
export function confirmExit(onExit) {
  if (window.confirm('Выйти из игры? Текущая попытка не сохранится.')) onExit();
}

// `runningLabel` covers both the not-yet-started and running states
// (e.g. "Запустите, когда тексты уже отправлены группам — на
// обсуждение и ответ") — only the done state gets its own message,
// since it's the one state that actually changes what the card means.
//
// `timer` is an AnswerTimerController. A game with several timed rounds
// (availability.js: one 20s timer per question) renders a card in each
// round but only ONE of them is live at a time: pass `active: false` for
// the others so they show an idle card, and `onStart`/`onReset` to route
// the buttons to whatever marks that round as the live one. `compact`
// shrinks the card to a single slim row so it fits above a full
// participant table on one screen.
export function renderAnswerTimer(
  timer,
  { runningLabel, doneLabel = 'Время вышло', active = true, compact = false, onStart, onReset },
) {
  const { duration } = timer;
  const running = active && timer.running;
  const seconds = active ? timer.seconds : duration;
  const done = active && timer.done;
  const start = onStart || (() => timer.start());
  const reset = onReset || (() => timer.reset());
  return html`
    <div class="round-timer ${compact ? 'compact' : ''} ${running ? 'running' : ''} ${done ? 'done' : ''}">
      <div class="round-timer-info">
        <span class="round-timer-clock">⏱</span>
        <span class="round-timer-time">${formatTimer(seconds)}</span>
        <span class="round-timer-label">${done ? doneLabel : runningLabel}</span>
      </div>
      <div class="round-timer-track">
        <div style="width:${(seconds / duration) * 100}%"></div>
      </div>
      <div class="round-timer-actions">
        ${
          !running
            ? html`<button class="ghost" @click=${start}>
                ${seconds === duration ? 'Запустить таймер' : 'Запустить снова'}
              </button>`
            : html`<button class="ghost" @click=${reset}>Сбросить</button>`
        }
      </div>
    </div>
  `;
}

// Results-screen headline: the big number plus three plain-language
// lines (see reveal-copy.js for what each says). `valueId` keeps a
// game's existing id on the number (tests and print hooks look it up).
export function renderReveal({ value, valueId, what, read, verdict }) {
  return html`
    <div class="reveal">
      <div class="n" id=${valueId ?? nothing}>${value}</div>
      <dl class="reveal-lines">
        <div class="reveal-line">
          <dt>Что это</dt>
          <dd>${what}</dd>
        </div>
        <div class="reveal-line">
          <dt>Как читать</dt>
          <dd>${read}</dd>
        </div>
        ${
          verdict
            ? html`<div class="reveal-line reveal-verdict">
                <dt>У вашей команды</dt>
                <dd>${verdict}</dd>
              </div>`
            : nothing
        }
      </dl>
    </div>
  `;
}
