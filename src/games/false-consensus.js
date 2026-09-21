/* =========================================================
   GAME: Эффект ложного консенсуса (false-consensus)

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   same pattern as crowd-wisdom (custom question) plus the first game
   using .toggle-pair (Да/Нет) buttons instead of number inputs. Keeps
   its original plain ids, same reasoning as crowd-wisdom's header
   comment.
========================================================= */

import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { tipHtml } from '../charts/kit.js';
import { drawSwarm } from '../charts/swarm.js';
import CONTENT from '../content/false-consensus.json';
import { renderContext, renderFacts, renderNote, renderSteps } from '../content.js';
import { AnswerTimerController } from '../controllers/answer-timer-controller.js';
import { ChartController } from '../controllers/chart-controller.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { confirmExit, renderAnswerTimer, renderReveal } from '../game-shell.js';
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
import { buildCustomQuestionText, MESSAGES } from '../logic/custom-questions.js';
import {
  countFilled,
  hasEnough,
  hasFields,
  loadableDraft,
  parseNumberInput,
  patchRow,
} from '../logic/entries.js';
import { escapeHtml } from '../logic/format.js';
import { falseConsensusResults } from '../logic/results.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const DEFAULT_QUESTION =
  'Готовы ли вы прямо сейчас, без подготовки, провести 5-минутную презентацию перед всей командой?';
const ENTRY_TIMER_SECONDS = 30;
const TOTAL_SCREENS = 4;
const ROUND_TITLES = [
  'Один вопрос про вас — и про всех остальных',
  'Впишите ответы каждого участника',
  'Что получилось у вашей команды',
  'Эффект ложного консенсуса',
];

export class RetroGameFalseConsensus extends LitElement {
  static styles = sharedStyles;

  static properties = {
    data: { state: true },
    draft: { state: true },
    results: { state: true },
    question: { state: true },
    isCustomQuestion: { state: true },
    customPanelOpen: { state: true },
    customQStatus: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.charts = new ChartController(this, [
      {
        id: 'fc-chart',
        when: () => this.results,
        draw: (svg, theme) => this._drawChart(svg, theme),
      },
    ]);
    // A 30s countdown for collecting everyone's answers (visual only).
    this.timer = new AnswerTimerController(this, ENTRY_TIMER_SECONDS);
    this.data = this._blankData();
    this.results = null;
    this.question = DEFAULT_QUESTION;
    this.isCustomQuestion = false;
    this.customPanelOpen = false;
    this.customQStatus = '';

    this.draft = loadableDraft(Persist.load('false-consensus'), {
      key: 'data',
      length: this.names.length,
    });
  }

  _blankData() {
    return this.names.map((n) => ({ name: n, own: null, estimate: null }));
  }

  _restoreDraft() {
    this.flow.advance(1, () => {
      this.data = this.draft.payload.data;
      if (this.draft.payload.question) {
        this.question = this.draft.payload.question;
        this.isCustomQuestion = true;
      }
      this.draft = null;
    });
  }

  _discardDraft() {
    Persist.clear('false-consensus');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('false-consensus');
    renderHome();
  }

  _toggleCustomPanel() {
    this.customPanelOpen = !this.customPanelOpen;
  }

  _applyCustomQuestion() {
    const result = buildCustomQuestionText(this.renderRoot.getElementById('custom-q-text').value);
    if (!result.ok) {
      this.customQStatus = result.error;
      return;
    }
    this.question = result.question;
    this.isCustomQuestion = true;
    this.customQStatus = result.message;
  }

  _resetCustomQuestion() {
    this.question = DEFAULT_QUESTION;
    this.isCustomQuestion = false;
    this.customQStatus = MESSAGES.resetOne;
    this.renderRoot.getElementById('custom-q-text').value = '';
  }

  _persist() {
    Persist.save('false-consensus', {
      data: this.data,
      question: this.isCustomQuestion ? this.question : null,
    });
  }

  _onToggle(idx, val) {
    this.data = patchRow(this.data, idx, { own: val });
    this._persist();
  }

  _onEstimateInput(e, idx) {
    this.data = patchRow(this.data, idx, {
      estimate: parseNumberInput(e.target.value, { min: 0, max: 100 }),
    });
    this._persist();
  }

  _filledCount() {
    return countFilled(this.data, hasFields('own', 'estimate'));
  }

  _showResults() {
    this.results = falseConsensusResults(this.data);
    const { filled } = this.results;

    ReportExport.register(
      'false-consensus',
      {
        subtitle: this.isCustomQuestion
          ? this.question
          : 'Мы уверены, что наше мнение разделяют куда больше людей, чем на самом деле.',
        meta: ReportExport.meta(filled.length),
        explanation:
          'Мы систематически переоцениваем, насколько остальные разделяют наше собственное мнение или поведение — потому что единственная реальная точка отсчёта, которая у нас есть, это мы сами. Эффект описали психологи Ли Росс, Дэвид Грин и Памела Хаус в серии экспериментов в Стэнфорде в 1977 году.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear('false-consensus');
    this.timer.reset();
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  // Everyone's forecast of "% of the team that says yes", split by what they said
  // themselves — with the REAL share as a reference line. If each side's cloud sits
  // around its own answer instead of around the line, that's the false consensus.
  _drawChart(svg, theme) {
    const { filled, realYesPct } = this.results;
    const lane = (label, color, own) => ({
      label,
      color,
      domain: [0, 100],
      ticks: [0, 25, 50, 75, 100],
      format: (v) => `${v}%`,
      refs: [{ value: realYesPct, label: `на самом деле «да»: ${realYesPct}%`, color: theme.gold }],
      points: filled
        .filter((d) => d.own === own)
        .map((d) => ({
          id: d.name,
          value: d.estimate,
          tip: tipHtml(escapeHtml(d.name), [
            ['Свой ответ', own === 'yes' ? 'Да' : 'Нет'],
            ['Ждал(а) «да»', `${d.estimate}%`],
            ['Ошибка', `${d.estimate - realYesPct >= 0 ? '+' : ''}${d.estimate - realYesPct} п.п.`],
          ]),
        })),
    });
    drawSwarm(svg, {
      lanes: [
        lane('Сказали «да» — ждали «да» у…', theme.accent, 'yes'),
        lane('Сказали «нет» — ждали «да» у…', theme.red, 'no'),
      ],
      theme,
    });
  }

  _entryRow(row, idx) {
    return html`
      <div class="entry-row toggle-col">
        <div class="name">${unsafeHTML(avatarName(row.name))}</div>
        <div class="toggle-pair">
          <button
            type="button"
            data-val="yes"
            class=${row.own === 'yes' ? 'on' : ''}
            @click=${() => this._onToggle(idx, 'yes')}
          >
            Да
          </button>
          <button
            type="button"
            data-val="no"
            class=${row.own === 'no' ? 'on' : ''}
            @click=${() => this._onToggle(idx, 'no')}
          >
            Нет
          </button>
        </div>
        <input
          type="number"
          min="0"
          max="100"
          inputmode="numeric"
          aria-label="${row.name}: прогноз доли «да», %"
          placeholder="0–100"
          .value=${row.estimate ?? ''}
          @input=${(e) => this._onEstimateInput(e, idx)}
        />
      </div>
    `;
  }

  render() {
    const filled = this._filledCount();
    const r = this.results;

    return html`
      <div class="wrap-wide" style=${gameAccentStyle('false-consensus')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
          <p class="eyebrow">Командное упражнение · 6 минут</p>
          <h1>Один вопрос про вас — и про всех остальных</h1>
          <p class="lede">
            Два быстрых ответа на человека. Отвечайте честно, не подглядывая на соседей.
          </p>

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

          ${renderSteps(CONTENT.intro.steps, { question: this.question })}

          ${renderNote(CONTENT.intro.note)}

          <div class="custom-q-toggle-row">
            <button type="button" class="secondary" id="custom-q-toggle" @click=${() => this._toggleCustomPanel()}>
              ${unsafeHTML(ICON_EDIT)} Задать свой вопрос вместо стандартного
            </button>
          </div>
          <div class="custom-q-panel" id="custom-q-panel" ?hidden=${!this.customPanelOpen}>
            <div class="custom-q-field">
              <label for="custom-q-text">Текст вопроса (да/нет)</label>
              <input
                type="text"
                id="custom-q-text"
                placeholder="Например: готовы ли вы прямо сейчас взяться за тикет без документации?"
              />
            </div>
            <div class="custom-q-actions">
              <button type="button" class="primary" id="custom-q-apply" @click=${() => this._applyCustomQuestion()}>
                Применить свой вопрос
              </button>
              <button
                type="button"
                class="secondary"
                id="custom-q-reset"
                ?hidden=${!this.isCustomQuestion}
                @click=${() => this._resetCustomQuestion()}
              >
                ↺ Вернуть стандартный
              </button>
            </div>
            <p class="note" id="custom-q-status">${this.customQStatus}</p>
          </div>

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.flow.advance(1)}>Вносить данные ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(0)}
        </section>

        <section class="${this.flow.roundClass(1)}" id="round-1">
          <div class="round-body">
          <p class="eyebrow">Сбор данных</p>
          <h2>Впишите ответы каждого участника</h2>
          <p class="lede">Свой ответ (да/нет) и оценку, какой % команды тоже скажет «да».</p>

          ${renderAnswerTimer(this.timer, {
            compact: true,
            defaultDuration: ENTRY_TIMER_SECONDS,
            onDurationChange: (seconds) => this.timer.setDuration(seconds),
            runningLabel: 'на ответы',
          })}

          <div class="entry-head toggle-col">
            <div>Участник</div>
            <div>Свой ответ</div>
            <div>% команды «да»</div>
          </div>
          <div id="entry-body">${this.data.map((row, i) => this._entryRow(row, i))}</div>

          <div class="fill-progress">
            Заполнено: <span>${filled}</span> из <span>${this.names.length}</span>
            <div class="track">
              <div style="width:${(filled / this.names.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" ?disabled=${!hasEnough(filled)} @click=${() =>
              this.flow.advance(2, () => {
                this.timer.reset();
                this._showResults();
              })}>
              Показать результаты ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(1)}
        </section>

        <section class="${this.flow.roundClass(2)}" id="round-2">
          <div class="round-body">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>

          ${renderReveal({ value: r ? `${r.realYesPct}%` : '—', valueId: 'real-yes', ...REVEAL_COPY.falseConsensus(r ? { realYesPct: r.realYesPct, yesAvg: r.yesAvg, noAvg: r.noAvg } : null) })}

          <div class="group-compare">
            <div class="g low">
              <div class="t">Средний прогноз у тех, кто сам сказал «да»</div>
              <div class="v" id="yes-side-avg">${r && r.yesAvg !== null ? `${r.yesAvg}%` : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Средний прогноз у тех, кто сам сказал «нет»</div>
              <div class="v" id="no-side-avg">${r && r.noAvg !== null ? `${r.noAvg}%` : '—'}</div>
            </div>
          </div>

          <p id="fc-compare-text">${r ? r.compareText : ''}</p>

          <div class="d3-chart-card">
            <div class="d3-chart-title">Кого сколько ждали «да» — по ответам</div>
            <svg id="fc-chart" class="d3-chart-svg" role="img" aria-label="Прогнозы доли «да» у тех, кто ответил «да», и у тех, кто ответил «нет»"></svg>
            <p class="d3-chart-cap">Точка — прогноз одного человека. Золотая линия — реальная доля «да» в команде. Если каждая сторона сгруппировалась вокруг собственного ответа, а не вокруг линии, — это и есть ложный консенсус.</p>
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Свой ответ</th>
                <th>Прогноз, % «да»</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.filled.map(
                      (d) => html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                        <td>${d.own === 'yes' ? 'Да' : 'Нет'}</td>
                        <td>${d.estimate}%</td>
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
            <button class="ghost" @click=${() => this.flow.scrollTo(1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.flow.advance(3)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(2)}
        </section>

        <section class="${this.flow.roundClass(3)}" id="round-3">
          <div class="round-body">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Эффект ложного консенсуса</h1>
          ${renderContext(CONTENT.context)}

          <hr />
          <h2>Ещё немного фактов</h2>

          ${renderFacts(CONTENT.facts)}

          <div class="nav-row">
            <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
            <span></span>
          </div>
          </div>
          ${this.flow.lock(3)}
        </section>
          </div>

          <aside class="game-rail">
            <div class="game-rail-title">Ложный консенсус</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'false-consensus',
              stepLabels: ROUND_TITLES,
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-false-consensus', RetroGameFalseConsensus);
