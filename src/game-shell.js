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
import { classMap } from 'lit/directives/class-map.js';
import { confirmDialog } from './confirm-dialog.js';
import {
  formatTimer,
  MAX_DURATION,
  MIN_DURATION,
  nudgeDuration,
  parseDuration,
} from './logic/timer.js';

// The × in the corner (replaces the old .game-crumb back-link) —
// exiting mid-attempt clears the draft same as the old back-link did,
// so it's worth a confirmation rather than a silent one-click exit.
// A real <dialog> (confirm-dialog.js): styled like the rest of the app,
// keyboard- and screen-reader-friendly, and it doesn't freeze the page.
// Fire-and-forget: `onExit` runs only if the person confirms.
export function confirmExit(onExit) {
  confirmDialog({
    title: 'Выйти из игры?',
    message: 'Текущая попытка не сохранится.',
    confirmLabel: 'Выйти',
    cancelLabel: 'Остаться',
  }).then((confirmed) => {
    if (confirmed) onExit();
  });
}

// `runningLabel` covers both the not-yet-started and running states
// (e.g. "Запустите, когда тексты уже отправлены группам — на
// обсуждение и ответ") — only the done state gets its own message,
// since it's the one state that actually changes what the card means.
//
// `timer` is an AnswerTimerController. Options:
//   active / onStart / onReset   a game with several timed rounds
//       (availability.js: one timer per question) renders a card in each
//       round but only ONE is live at a time — pass `active: false` for
//       the others (they show an idle card) and route the buttons to
//       whatever marks that round as the live one.
//   compact      one slim row, so it fits above a full participant table.
//   duration     THIS card's length in seconds (defaults to the timer's
//       own) — an idle card of a not-live round shows its own length.
//   defaultDuration + onDurationChange   makes the length editable while
//       the card is idle: − / + steps and a typeable m:ss field. When the
//       length differs from the default, "вернуть 2:00" puts it back.
export function renderAnswerTimer(
  timer,
  {
    runningLabel,
    doneLabel = 'Время вышло',
    active = true,
    compact = false,
    onStart,
    onReset,
    duration: cardDuration,
    defaultDuration,
    onDurationChange,
  },
) {
  const duration = active ? timer.duration : (cardDuration ?? timer.duration);
  const running = active && timer.running;
  const seconds = active ? timer.seconds : duration;
  const done = active && timer.done;
  const idle = !running && !done && seconds === duration;
  const start = onStart || (() => timer.start());
  const reset = onReset || (() => timer.reset());
  const editable = idle && typeof onDurationChange === 'function';
  const differsFromDefault = defaultDuration !== undefined && duration !== defaultDuration;

  const commitTyped = (event) => {
    const parsed = parseDuration(event.target.value);
    // Not a time → put the old value back rather than silently ignoring.
    event.target.value = formatTimer(parsed ?? duration);
    if (parsed !== null && parsed !== duration) onDurationChange(parsed);
  };

  return html`
    <div class="${classMap({ 'round-timer': true, compact, running, done })}">
      <div class="round-timer-info">
        <span class="round-timer-clock">⏱</span>
        ${
          editable
            ? html`<span class="round-timer-adjust">
                <button
                  type="button"
                  class="timer-step"
                  aria-label="Уменьшить время"
                  ?disabled=${duration <= MIN_DURATION}
                  @click=${() => onDurationChange(nudgeDuration(duration, -1))}
                >−</button>
                <input
                  class="round-timer-time round-timer-input"
                  type="text"
                  inputmode="numeric"
                  aria-label="Длительность таймера (м:сс или секунды)"
                  .value=${formatTimer(duration)}
                  @change=${commitTyped}
                  @keydown=${(e) => e.key === 'Enter' && e.target.blur()}
                />
                <button
                  type="button"
                  class="timer-step"
                  aria-label="Увеличить время"
                  ?disabled=${duration >= MAX_DURATION}
                  @click=${() => onDurationChange(nudgeDuration(duration, 1))}
                >+</button>
              </span>`
            : html`<span class="round-timer-time">${formatTimer(seconds)}</span>`
        }
        <span class="round-timer-label">${done ? doneLabel : runningLabel}</span>
      </div>
      <div class="round-timer-track">
        <div style="width:${(seconds / duration) * 100}%"></div>
      </div>
      <div class="round-timer-actions">
        ${
          editable && differsFromDefault
            ? html`<button type="button" class="secondary timer-default" @click=${() => onDurationChange(defaultDuration)}>
                вернуть ${formatTimer(defaultDuration)}
              </button>`
            : ''
        }
        ${
          !running
            ? html`${
                done && typeof onDurationChange === 'function'
                  ? html`<button type="button" class="secondary" @click=${reset}>Изменить время</button>`
                  : ''
              }
                <button class="ghost" @click=${start}>
                  ${idle ? 'Запустить таймер' : 'Запустить снова'}
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
