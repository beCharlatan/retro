/* =========================================================
   GAME: Калибровка уверенности (calibration)
   The heaviest data-entry pattern in the catalog: instead of
   one value per person, we need a low/high range per person
   PER QUESTION. Rather than cramming every question onto one
   screen, each question gets its own entry screen (reusing
   the plain 3-column entry-row/entry-head pattern already used
   by anchoring.js) — simpler to fill in live, one question at
   a time, same rhythm as reading questions aloud.

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   last game converted. Combines the repeated-question-screen pattern
   (availability.js) with a custom-question panel that can replace
   ANY SUBSET of the 3 questions (crowd-wisdom.js's/false-consensus.js's
   single-question custom panel, generalized to 3 independent slots).
   The custom-question panel's hints/placeholders intentionally read
   from DEFAULT_QUESTIONS, not the current (possibly-customized)
   `this.questions` — same as the legacy version, whose panel HTML was
   only ever built once at the original defaults. Keeps all original
   plain ids (q-heading-N, custom-q-text/answer/unit-N, entry-body-N,
   next-btn-N, ...).

   One-continuous-scroll деталка — see framing.js for the full
   write-up of this layout and game-shell.js for the shared navigation
   helpers every game now uses. ROUND_TITLES isn't a fixed top-level
   const here like in the other games — this is the one game whose
   round titles (the question text) can change at runtime via the
   custom-question panel, so _roundTitles() below rebuilds it from
   `this.questions` each time instead.
========================================================= */

import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { drawIntervals } from '../charts/intervals.js';
import CONTENT from '../content/calibration.json';
import { renderContext, renderFacts, renderNote, renderSteps } from '../content.js';
import { ChartController } from '../controllers/chart-controller.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { RoundTimers } from '../controllers/round-timers.js';
import { clearQuestionSlots, readQuestionSlots } from '../custom-question-form.js';
import { confirmExit, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import {
  ICON_CLIPBOARD,
  ICON_DOWNLOAD,
  ICON_EDIT,
  ICON_LEFT,
  ICON_RIGHT,
  ICON_X,
} from '../icons.js';
import { buildCustomQuestions, cloneQuestions, MESSAGES } from '../logic/custom-questions.js';
import {
  countFilled,
  hasEnough,
  loadableDraft,
  parseNumberInput,
  patchItem,
} from '../logic/entries.js';
import { formatPercent, outcomeMark } from '../logic/format.js';
import { calibrationBars, calibrationResults, calibrationRows } from '../logic/results.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

// Deliberately HARD, specialist numbers — chemistry, history, biology, geography —
// that nobody can work out from general knowledge. That is the point: with a
// question you have no way to know, an honest "90% range" has to be enormous,
// and people almost always name a range far too narrow (overconfidence).
const DEFAULT_QUESTIONS = [
  { q: 'Какова температура плавления вольфрама, в градусах Цельсия?', answer: 3422, unit: ' °C' },
  {
    q: 'В каком году состоялась битва при Манцикерте, в которой сельджуки разгромили армию Византии?',
    answer: 1071,
    unit: '',
  },
  {
    q: 'Сколько хромосом в диплоидном наборе клеток домашней собаки?',
    answer: 78,
    unit: ' хромосом',
  },
  {
    q: 'На какой высоте над уровнем моря находится озеро Титикака, в метрах?',
    answer: 3812,
    unit: ' м',
  },
];
const QUESTION_TIMER_SECONDS = 20;
const TOTAL_SCREENS = 3 + DEFAULT_QUESTIONS.length; // instructions + Qn + results + context

export class RetroGameCalibration extends LitElement {
  static styles = sharedStyles;

  static properties = {
    questions: { state: true },
    entries: { state: true },
    draft: { state: true },
    results: { state: true },
    isCustomQuestions: { state: true },
    customPanelOpen: { state: true },
    customQStatus: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.flow = new RoundFlowController(this, { titles: () => this._roundTitles() });
    this.questions = cloneQuestions(DEFAULT_QUESTIONS);
    this.entries = this._blankEntries();
    this.results = null;
    this.charts = new ChartController(this, [
      {
        id: 'cal-chart',
        when: () => this.results,
        draw: (svg, theme) => this._drawChart(svg, theme),
      },
    ]);
    this.isCustomQuestions = false;
    this.customPanelOpen = false;
    this.customQStatus = '';
    // One 20s timer, live for one question at a time; each question keeps its own length.
    this.timers = new RoundTimers(this, {
      seconds: QUESTION_TIMER_SECONDS,
      count: DEFAULT_QUESTIONS.length,
    });

    this.draft = loadableDraft(Persist.load('calibration'), {
      key: 'entries',
      length: this.names.length,
    });
  }

  _blankEntries() {
    return this.names.map((n) => ({
      name: n,
      ranges: this.questions.map(() => ({ low: null, high: null })),
    }));
  }

  _roundTitles() {
    return [
      'Насколько вы на самом деле уверены?',
      ...this.questions.map((q) => q.q),
      'Что получилось у вашей команды',
      'Калибровка уверенности',
    ];
  }

  _restoreDraft() {
    this.flow.advance(1, () => {
      this.entries = this.draft.payload.entries;
      if (this.draft.payload.questions) {
        this.questions = this.draft.payload.questions;
        this.isCustomQuestions = true;
      }
      this.draft = null;
    });
  }

  _discardDraft() {
    Persist.clear('calibration');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('calibration');
    renderHome();
  }

  _toggleCustomPanel() {
    this.customPanelOpen = !this.customPanelOpen;
  }

  _applyCustomQuestions() {
    const result = buildCustomQuestions(
      DEFAULT_QUESTIONS,
      readQuestionSlots(this.renderRoot, DEFAULT_QUESTIONS.length),
    );
    if (!result.ok) {
      this.customQStatus = result.error;
      return;
    }
    this.questions = result.questions;
    this.isCustomQuestions = result.isCustom;
    this.customQStatus = result.message;
  }

  _resetCustomQuestions() {
    this.questions = cloneQuestions(DEFAULT_QUESTIONS);
    this.isCustomQuestions = false;
    this.customQStatus = MESSAGES.resetAll;
    clearQuestionSlots(this.renderRoot, DEFAULT_QUESTIONS.length);
  }

  _onEntryInput(e, idx, qIdx, field) {
    const v = parseNumberInput(e.target.value);
    this.entries = patchItem(this.entries, idx, 'ranges', qIdx, (r) => ({ ...r, [field]: v }));
    Persist.save('calibration', {
      entries: this.entries,
      questions: this.isCustomQuestions ? this.questions : null,
    });
  }

  _filledCount(qIdx) {
    return countFilled(
      this.entries,
      (e) => e.ranges[qIdx].low !== null && e.ranges[qIdx].high !== null,
    );
  }

  _next(qIdx) {
    this.timers.reset();
    if (qIdx === this.questions.length - 1) {
      this.flow.advance(1 + this.questions.length, () => this._showResults());
    } else {
      this.flow.advance(2 + qIdx);
    }
  }

  // One lane per question: every person's range as a bar, the true answer as a line.
  _drawChart(svg, theme) {
    drawIntervals(svg, {
      lanes: this.results.bars.map(({ question, bars }) => ({
        title: question.q,
        answer: question.answer,
        unit: question.unit,
        bars,
      })),
      theme,
    });
  }

  _showResults() {
    const answersReveal =
      'Правильные ответы: ' +
      this.questions.map((q, i) => `(${i + 1}) ${q.answer}${q.unit}`).join(' · ');
    this.results = {
      ...calibrationResults(this.entries, this.questions),
      bars: calibrationBars(this.entries, this.questions),
      answersReveal,
    };

    ReportExport.register(
      'calibration',
      {
        subtitle: 'Уверены на 90%? Реальное попадание обычно куда ниже.',
        meta: ReportExport.meta(this.entries.length),
        explanation:
          'Люди систематически переоценивают точность собственных знаний: если попросить 90%-й доверительный интервал, правильный ответ на деле попадает в него заметно реже, чем в 90% случаев. Классическая работа — Alpert M., Raiffa H. (1982) в сборнике Kahneman, Slovic, Tversky «Judgment Under Uncertainty».',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.entries = this._blankEntries();
    this.results = null;
    Persist.clear('calibration');
    this.timers.resetAll(this.questions.length);
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  _customQuestionBlock(def, i) {
    return html`
      <div class="custom-q-block">
        <div class="custom-q-block-title">
          Вопрос ${i + 1}
          <span class="custom-q-default-hint">по умолчанию: «${def.q}», ответ ${def.answer}${def.unit}</span>
        </div>
        <div class="custom-q-field">
          <label for="custom-q-text-${i}">Текст вопроса</label>
          <input type="text" id="custom-q-text-${i}" placeholder="${def.q}" />
        </div>
        <div class="custom-q-row">
          <div class="custom-q-field">
            <label for="custom-q-answer-${i}">Правильный ответ</label>
            <input type="number" id="custom-q-answer-${i}" placeholder="напр. ${def.answer}" />
          </div>
          <div class="custom-q-field">
            <label for="custom-q-unit-${i}">Единица (необязательно)</label>
            <input type="text" id="custom-q-unit-${i}" placeholder="напр. ${def.unit.trim() || 'лет'}" />
          </div>
        </div>
      </div>
    `;
  }

  _questionScreen(qIdx) {
    const q = this.questions[qIdx];
    const isLast = qIdx === this.questions.length - 1;
    const nextLabel = isLast ? 'Показать результаты' : 'Следующий вопрос';
    const filled = this._filledCount(qIdx);
    return html`
      <section class="${this.flow.roundClass(1 + qIdx)}" id="round-${1 + qIdx}">
        <div class="round-body">
        <p class="eyebrow">Вопрос ${qIdx + 1} из ${this.questions.length}</p>
        <h2 id="q-heading-${qIdx}">${q.q}</h2>
        <p class="lede">Для каждого — диапазон, в который он уверен на 90%, что попадёт правильный ответ.</p>

        ${this.timers.card(qIdx, { runningLabel: 'на ответ', compact: true })}

        <div class="entry-head">
          <div>Участник</div>
          <div>Нижняя граница</div>
          <div>Верхняя граница</div>
        </div>
        <div id="entry-body-${qIdx}">
          ${this.entries.map((e, i) => {
            const r = e.ranges[qIdx];
            return html`
              <div class="entry-row">
                <div class="name">${unsafeHTML(avatarName(e.name))}</div>
                <input
                  type="number"
                  inputmode="numeric"
                  aria-label="${e.name}: минимум, вопрос ${qIdx + 1}"
                  placeholder="мин."
                  .value=${r.low ?? ''}
                  @input=${(ev) => this._onEntryInput(ev, i, qIdx, 'low')}
                />
                <input
                  type="number"
                  inputmode="numeric"
                  aria-label="${e.name}: максимум, вопрос ${qIdx + 1}"
                  placeholder="макс."
                  .value=${r.high ?? ''}
                  @input=${(ev) => this._onEntryInput(ev, i, qIdx, 'high')}
                />
              </div>
            `;
          })}
        </div>

        <div class="fill-progress">
          Заполнено: <span>${filled}</span> из <span>${this.names.length}</span>
          <div class="track">
            <div style="width:${(filled / this.names.length) * 100}%"></div>
          </div>
        </div>

        <div class="nav-row">
          <button class="ghost" @click=${() => this.flow.scrollTo(qIdx)}>${unsafeHTML(ICON_LEFT)} Назад</button>
          <button
            class="primary"
            id="next-btn-${qIdx}"
            ?disabled=${!hasEnough(filled)}
            @click=${() => this._next(qIdx)}
          >
            ${nextLabel} ${unsafeHTML(ICON_RIGHT)}
          </button>
        </div>
        </div>
        ${this.flow.lock(1 + qIdx)}
      </section>
    `;
  }

  render() {
    const r = this.results;

    return html`
      <div class="wrap-wide" style=${gameAccentStyle('calibration')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
          <p class="eyebrow">Командное упражнение · 10 минут</p>
          <h1>Насколько вы на самом деле уверены?</h1>
          <p class="lede">${this.questions.length} коротких вопроса. На каждый — не точный ответ, а диапазон.</p>

          <div class="draft-mount">
            ${
              this.draft
                ? html`
                  <div class="draft-banner">
                    <span class="draft-text"
                      >${unsafeHTML(ICON_CLIPBOARD)} Есть незавершённая попытка (${timeAgo(this.draft.savedAt)}) — продолжить
                      с того места?</span
                    >
                    <span class="draft-actions">
                      <button type="button" class="draft-restore" @click=${() => this._restoreDraft()}>
                        Восстановить
                      </button>
                      <button type="button" class="draft-discard" @click=${() => this._discardDraft()}>
                        Начать заново
                      </button>
                    </span>
                  </div>
                `
                : ''
            }
          </div>

          ${renderSteps(CONTENT.intro.steps)}

          ${renderNote(CONTENT.intro.note)}

          <div class="custom-q-toggle-row">
            <button type="button" class="secondary" id="custom-q-toggle" @click=${() => this._toggleCustomPanel()}>
              ${unsafeHTML(ICON_EDIT)} Задать свои вопросы вместо стандартных
            </button>
          </div>
          <div class="custom-q-panel" id="custom-q-panel" ?hidden=${!this.customPanelOpen}>
            <p class="note" style="margin:0 0 14px;">
              Можно заменить любой из вопросов — оставьте поле пустым, чтобы оставить
              стандартный.
            </p>
            ${DEFAULT_QUESTIONS.map((def, i) => this._customQuestionBlock(def, i))}
            <div class="custom-q-actions">
              <button type="button" class="primary" id="custom-q-apply" @click=${() => this._applyCustomQuestions()}>
                Применить
              </button>
              <button
                type="button"
                class="secondary"
                id="custom-q-reset"
                ?hidden=${!this.isCustomQuestions}
                @click=${() => this._resetCustomQuestions()}
              >
                ↺ Вернуть все стандартные
              </button>
            </div>
            <p class="note" id="custom-q-status">${this.customQStatus}</p>
          </div>

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.flow.advance(1)}>Начать вопросы ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(0)}
        </section>

        ${this.questions.map((_, i) => this._questionScreen(i))}

        <section class="${this.flow.roundClass(1 + this.questions.length)}" id="round-${1 + this.questions.length}">
          <div class="round-body">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>

          ${renderReveal({ value: r ? r.hitRate : '—', ...REVEAL_COPY.calibration(r ? { hitPct: r.totalAnswered ? Math.round((r.totalHits / r.totalAnswered) * 100) : null, totalHits: r.totalHits, totalAnswered: r.totalAnswered } : null) })}

          <div class="stat-row">
            ${
              r
                ? r.perQuestionStats.map(
                    (s, qi) => html`
                    <div class="stat">
                      <div class="n">${s.pct}%</div>
                      <div class="lab">попаданий в вопросе ${qi + 1}</div>
                    </div>
                  `,
                  )
                : ''
            }
          </div>

          <p class="note" id="answers-reveal">${r ? r.answersReveal : ''}</p>

          <div class="d3-chart-card">
            <div class="d3-chart-title">Кто в какой диапазон уверен — и попал ли</div>
            <svg id="cal-chart" class="d3-chart-svg" role="img" aria-label="Диапазоны участников по каждому вопросу и верный ответ"></svg>
            <p class="d3-chart-cap">Каждая полоска — «90%-й» диапазон одного человека. Цветная — накрыла верный ответ (золотая линия), красная — мимо. Узкие красные полоски наверху — это самоуверенность.</p>
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                ${this.questions.map((_, i) => html`<th>В${i + 1}</th>`)}
                <th>Попаданий</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? calibrationRows(this.entries, this.questions).map(
                      (row) => html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(row.name))}</td>
                        ${row.outcomes.map((o) => html`<td>${outcomeMark(o)}</td>`)}
                        <td>${formatPercent(row.pct)}</td>
                      </tr>
                    `,
                    )
                  : ''
              }
            </tbody>
          </table>

          <div class="export-row">
            <button class="ghost" id="export-btn" @click=${(e) => ReportExport.download(e.currentTarget)}>
              ${unsafeHTML(ICON_DOWNLOAD)} Сохранить результаты
            </button>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(this.questions.length)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.flow.advance(2 + this.questions.length)}>
              Что это было? ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(1 + this.questions.length)}
        </section>

        <section class="${this.flow.roundClass(2 + this.questions.length)}" id="round-${2 + this.questions.length}">
          <div class="round-body">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Калибровка уверенности</h1>
          ${renderContext(CONTENT.context)}

          <hr />
          <h2>Ещё немного фактов</h2>

          ${renderFacts(CONTENT.facts)}

          <div class="nav-row">
            <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
            <span></span>
          </div>
          </div>
          ${this.flow.lock(2 + this.questions.length)}
        </section>
          </div>

          <aside class="game-rail">
            <div class="game-rail-title">Калибровка уверенности</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'calibration',
              stepLabels: this._roundTitles(),
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-calibration', RetroGameCalibration);
