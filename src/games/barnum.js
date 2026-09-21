/* =========================================================
   GAME: Эффект Барнума / Форера (barnum)

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   same pattern as the earlier solo games, plus the first game with a
   copy-to-clipboard button (copyToClipboard() from ../toast.js
   operates on the passed button element directly, so it needs no
   shadow-root-awareness of its own). Keeps its original plain id
   (#copy-profile), same reasoning as crowd-wisdom's header comment.
========================================================= */

import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { tipHtml } from '../charts/kit.js';
import { drawSwarm } from '../charts/swarm.js';
import CONTENT from '../content/barnum.json';
import { renderContext, renderFacts, renderNote, renderSteps } from '../content.js';
import { ChartController } from '../controllers/chart-controller.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { SpoilerController } from '../controllers/spoiler-controller.js';
import { confirmExit, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_DOWNLOAD, ICON_LEFT, ICON_RIGHT, ICON_X } from '../icons.js';
import {
  countFilled,
  hasEnough,
  hasFields,
  loadableDraft,
  parseNumberInput,
  patchRow,
} from '../logic/entries.js';
import { escapeHtml } from '../logic/format.js';
import { barnumResults } from '../logic/results.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { renderSpoilerCard } from '../spoiler-card.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const PROFILE_TEXT =
  'Иногда вы сомневаетесь, правильно ли поступили или приняли верное решение. Вы цените, когда вас окружают доказательства того, что вас любят и уважают, но при этом умеете быть требовательны к себе. У вас есть значительный неиспользуемый потенциал, который вы не всегда обращаете себе на пользу. Внешне вы дисциплинированы и держите себя в руках, но внутри нередко испытываете тревогу и неуверенность. Порой вы всерьёз сомневаетесь, правильный ли выбор сделали в жизни или в карьере. Вам нравится определённая доля перемен и разнообразия, а жёсткие рамки и ограничения вызывают недовольство.';
// The three "warm-up" questions the facilitator asks each person the DAY BEFORE
// the game, supposedly to prepare a personal portrait from their answers. They
// are deliberately innocuous and open-ended — they sound like small talk, not a
// personality test — so people genuinely believe their answers fed the text they
// later receive (which is in fact the same for everyone and ignores them).
const QUESTIONS = [
  'Опишите, как обычно выглядит ваше идеальное утро: что вы делаете в первые полчаса после пробуждения и почему именно это?',
  'Вспомните недавнюю ситуацию на работе, в которой вы поступили не так, как от вас ожидали. Что произошло и как вы к этому пришли?',
  'Представьте свободный день без обязательств и без планов. Чем бы вы его занялись — и что подсказывает вам, что это именно ваше?',
];
const QUESTIONS_INTRO =
  'Для подготовки к завтрашней встрече ответьте, пожалуйста, на три вопроса — парой предложений, своими словами, как первым придёт в голову:';
const QUESTIONS_TEXT = `${QUESTIONS_INTRO}\n\n${QUESTIONS.map((q, i) => `${i + 1}. ${q}`).join('\n\n')}`;

const TOTAL_SCREENS = 4;
const ROUND_TITLES = [
  'Персональный психологический портрет команды',
  'Впишите оценку каждого участника',
  'Что получилось у вашей команды',
  'Эффект Барнума / Форера',
];

export class RetroGameBarnum extends LitElement {
  static styles = sharedStyles;

  static properties = {
    data: { state: true },
    draft: { state: true },
    results: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.data = this._blankData();
    this.results = null;
    this.charts = new ChartController(this, [
      {
        id: 'barnum-chart',
        when: () => this.results,
        draw: (svg, theme) => this._drawChart(svg, theme),
      },
    ]);
    // Both spoilers (the questions, the portrait text) start hidden.
    this.spoilers = new SpoilerController(this, ['questions', 'profile']);

    this.draft = loadableDraft(Persist.load('barnum'), {
      key: 'data',
      length: this.names.length,
    });
  }

  _blankData() {
    return this.names.map((n) => ({ name: n, rating: null }));
  }

  _restoreDraft() {
    this.flow.advance(1, () => {
      this.data = this.draft.payload.data;
      this.draft = null;
    });
  }

  _discardDraft() {
    Persist.clear('barnum');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('barnum');
    renderHome();
  }

  // Every rating stacked on its number 0–5, with the team average and Forer's 1949 result.
  _drawChart(svg, theme) {
    const { filled, avg } = this.results;
    drawSwarm(svg, {
      lanes: [
        {
          label: 'Насколько портрет «про меня»: 0 — совсем нет, 5 — точно в точку',
          color: theme.accent,
          domain: [-0.5, 5.5],
          ticks: [0, 1, 2, 3, 4, 5],
          refs: [
            { value: avg, label: `у вас: ${avg.toFixed(2)}`, color: theme.accentDeep },
            { value: 4.26, label: 'Форер, 1949: 4,26', color: theme.gold },
          ],
          points: filled.map((d) => ({
            id: d.name,
            value: d.rating,
            tip: tipHtml(escapeHtml(d.name), [['Оценка', `${d.rating} из 5`]]),
          })),
        },
      ],
      theme,
    });
  }

  // The three questions as a numbered list (used on the intro card and again in the results).
  _questionList() {
    return html`
      <ol class="question-list">
        ${QUESTIONS.map(
          (q, i) => html`
            <li class="question-list-item">
              <span class="question-list-num">${i + 1}</span>
              <span>${q}</span>
            </li>
          `,
        )}
      </ol>
    `;
  }

  _onEntryInput(e, idx) {
    this.data = patchRow(this.data, idx, {
      rating: parseNumberInput(e.target.value, { min: 0, max: 5 }),
    });
    Persist.save('barnum', { data: this.data });
  }

  _filledCount() {
    return countFilled(this.data, hasFields('rating'));
  }

  _showResults() {
    this.results = barnumResults(this.data);
    const { filled } = this.results;

    ReportExport.register(
      'barnum',
      {
        subtitle: 'Расплывчатое описание личности кажется удивительно «прямо про меня».',
        meta: ReportExport.meta(filled.length, '3 вопроса накануне'),
        explanation:
          'Расплывчатое, общее для всех описание личности воспринимается как удивительно точное и «прямо про меня» — потому что читающий сам додумывает подходящие примеры из своей жизни. Эффект впервые продемонстрировал психолог Бертрам Форер в 1949 году: все 39 студентов получили один и тот же текст и в среднем оценили его точность на 4.26 из 5. В нашем варианте накануне каждому задали три вопроса «для подготовки», но «личный портрет» от ответов не зависел — у всех он был один и тот же.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear('barnum');
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  _entryRow(row, idx) {
    return html`
      <div class="entry-row two-col">
        <div class="name">${unsafeHTML(avatarName(row.name))}</div>
        <input
          type="number"
          min="0"
          max="5"
          step="1"
          inputmode="numeric"
          aria-label="${row.name}: оценка точности от 0 до 5"
          placeholder="0–5"
          .value=${row.rating ?? ''}
          @input=${(e) => this._onEntryInput(e, idx)}
        />
      </div>
    `;
  }

  render() {
    const filled = this._filledCount();
    const r = this.results;

    return html`
      <div class="wrap-wide" style=${gameAccentStyle('barnum')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
          <p class="eyebrow">Командное упражнение · 6 минут</p>
          <h1>Персональный психологический портрет команды</h1>
          <p class="lede">
            Эксперимент растянут на два дня: накануне вы задаёте каждому три вопроса, а в день игры
            каждый получает «личный портрет», якобы составленный по его ответам.
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

          ${renderSteps(CONTENT.intro.steps)}

          ${renderNote(CONTENT.intro.note)}

          ${renderSpoilerCard(this.spoilers, {
            key: 'questions',
            title: 'Три вопроса для команды',
            hint: 'Вопросы скрыты — нажмите «Показать», чтобы прочитать самому, или сразу скопируйте и отправьте команде.',
            body: this._questionList(),
            copyText: QUESTIONS_TEXT,
          })}

          ${renderSpoilerCard(this.spoilers, {
            key: 'profile',
            title: 'Текст для команды',
            hint: 'Текст скрыт — нажмите «Показать», чтобы прочитать самому, или сразу скопируйте и отправьте каждому лично.',
            body: html`«${PROFILE_TEXT}»`,
            copyText: PROFILE_TEXT,
          })}

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
          <h2>Впишите оценку каждого участника</h2>
          <p class="lede">От 0 (совсем не про меня) до 5 (прямо в точку).</p>

          <div class="entry-head two-col">
            <div>Участник</div>
            <div>Оценка (0–5)</div>
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
            <button class="primary" ?disabled=${!hasEnough(filled)} @click=${() => this.flow.advance(2, () => this._showResults())}>
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

          ${renderReveal({ value: r ? `${r.avg.toFixed(2)} / 5` : '—', ...REVEAL_COPY.barnum(r ? { avg: r.avg } : null) })}

          <h3 class="scenario-result-title">Три вопроса, на которые отвечал каждый</h3>
          <div class="quote-card questions-recap" id="questions-recap">
            <p class="note">${QUESTIONS_INTRO}</p>
            ${this._questionList()}
          </div>

          <h3 class="scenario-result-title">«Личный портрет», который получил каждый</h3>
          <div class="quote-card" id="profile-recap">
            <p>«${PROFILE_TEXT}»</p>
          </div>

          <div class="d3-chart-card">
            <div class="d3-chart-title">Как команда оценила «свой» портрет</div>
            <svg id="barnum-chart" class="d3-chart-svg" role="img" aria-label="Оценки точности портрета от 0 до 5, по одной точке на человека"></svg>
            <p class="d3-chart-cap">Все получили один и тот же текст. Чем правее точки, тем сильнее сработал эффект Барнума; золотая линия — результат студентов Форера.</p>
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Оценка</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.filled.map(
                      (d) => html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                        <td>${d.rating} / 5</td>
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
          <h1>Эффект Барнума / Форера</h1>
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
            <div class="game-rail-title">Эффект Барнума</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'barnum',
              stepLabels: ROUND_TITLES,
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-barnum', RetroGameBarnum);
