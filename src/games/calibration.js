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
import { RoundFlowController } from '../controllers/round-flow-controller.js';
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
import { calibrationResults, calibrationRows } from '../logic/results.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const DEFAULT_QUESTIONS = [
  { q: 'В каком году была основана компания Google?', answer: 1998, unit: '' },
  { q: 'Какова высота горы Килиманджаро, в метрах?', answer: 5895, unit: ' м' },
  { q: 'Какова длина реки Волга, в километрах?', answer: 3530, unit: ' км' },
];
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
    this.isCustomQuestions = false;
    this.customPanelOpen = false;
    this.customQStatus = '';

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
    if (qIdx === this.questions.length - 1) {
      this.flow.advance(1 + this.questions.length, () => this._showResults());
    } else {
      this.flow.advance(2 + qIdx);
    }
  }

  _showResults() {
    const answersReveal =
      'Правильные ответы: ' +
      this.questions.map((q, i) => `(${i + 1}) ${q.answer}${q.unit}`).join(' · ');
    this.results = { ...calibrationResults(this.entries, this.questions), answersReveal };

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
                  placeholder="мин."
                  .value=${r.low ?? ''}
                  @input=${(ev) => this._onEntryInput(ev, i, qIdx, 'low')}
                />
                <input
                  type="number"
                  inputmode="numeric"
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

          <ol class="step-list">
            <li>
              <div class="step-num">1</div>
              <div class="step-body">
                <b>Задайте вопрос вслух</b>
                <span>Каждый вопрос — про число: год, высоту, длину. Не гуглите.</span>
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Каждый называет диапазон, а не число</b>
                <span
                  >Нижнюю и верхнюю границу, внутри которых, по ощущению, находится правильный
                  ответ с вероятностью 90%. Если не уверены — берите диапазон шире, а не
                  угадывайте точное число.</span
                >
              </div>
            </li>
          </ol>

          <p class="note">Задача — не угадать точно, а честно оценить границы своей уверенности.</p>

          <div class="custom-q-toggle-row">
            <button type="button" class="secondary" id="custom-q-toggle" @click=${() => this._toggleCustomPanel()}>
              ${unsafeHTML(ICON_EDIT)} Задать свои вопросы вместо стандартных
            </button>
          </div>
          <div class="custom-q-panel" id="custom-q-panel" ?hidden=${!this.customPanelOpen}>
            <p class="note" style="margin:0 0 14px;">
              Можно заменить любой из трёх вопросов — оставьте поле пустым, чтобы оставить
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
          <p class="lede">
            Люди систематически переоценивают точность собственных знаний: когда просят дать 90%-й
            диапазон, правильный ответ попадает в него куда реже, чем в 90% случаев.
          </p>

          <p>
            Классическая работа — Alpert M., Raiffa H. (1982). A Progress Report on the Training
            of Probability Assessors, глава в книге Kahneman D., Slovic P., Tversky A. (ред.)
            <i>Judgment Under Uncertainty: Heuristics and Biases</i>. Cambridge University Press.
          </p>

          <div class="stat-row">
            <div class="stat">
              <div class="n">90%</div>
              <div class="lab">заявленная уверенность</div>
            </div>
            <div class="stat">
              <div class="n">~40–60%</div>
              <div class="lab">реальное попадание у большинства людей в классических опытах</div>
            </div>
          </div>

          <p>
            Люди называют куда более узкие интервалы, чем оправдано их реальными знаниями —
            «уверенность» и «точность» оказываются разными вещами.
          </p>

          <p>
            <b>Что именно тут измеряется.</b> Калибровка — это не про то, знаете вы факт или нет,
            а про то, насколько ваше <i>ощущение</i> уверенности соответствует <i>реальной</i>
            вероятности быть правым. Идеально откалиброванный человек, называя диапазон «на
            90%», должен угадывать примерно 9 раз из 10 — не больше и не меньше. Если реальное
            попадание заметно ниже 90%, значит, интервалы были названы слишком узкими — человек
            почувствовал больше уверенности, чем позволяли его фактические знания. Любопытно, что
            решение — не «знать больше», а именно шире раскрывать границы неопределённости: если
            сомневаетесь, разумнее взять запас с обеих сторон, чем угадывать точное число.
          </p>

          <hr />
          <h2>Ещё немного фактов</h2>

          <div class="fact">
            <b>Калибровка — тренируемый навык</b
            ><span
              >Профессиональные прогнозисты и букмекеры откалиброваны заметно лучше среднего
              человека — за счёт постоянной обратной связи между прогнозом и реальным исходом.</span
            >
          </div>
          <div class="fact">
            <b>Более узкий диапазон ощущается как более компетентный</b
            ><span
              >Люди часто сужают интервал не потому, что действительно так уверены, а потому что
              широкий диапазон подсознательно кажется признанием некомпетентности — хотя честная
              широта тут и есть компетентность.</span
            >
          </div>
          <div class="fact">
            <b>Эффект Даннинга — Крюгера здесь рядом, но не то же самое</b
            ><span
              >Плохая калибровка касается всех уровней знаний, а не только новичков — эксперты
              тоже систематически называют слишком узкие интервалы в своей области, просто с виду
              это не так заметно, как у новичка.</span
            >
          </div>
          <div class="fact">
            <b>В медицине это вопрос жизни и смерти</b
            ><span
              >Исследования показывают, что врачи, давая прогнозы («сколько времени осталось» или
              «какова вероятность осложнения»), тоже подвержены плохой калибровке — что делает
              обучение специалистов честной оценке неопределённости отдельной важной задачей в
              медицинском образовании.</span
            >
          </div>
          <div class="fact">
            <b>Суперпрогнозисты откалиброваны заметно лучше</b
            ><span
              >В проекте Филипа Тетлока «Good Judgment Project» отдельная небольшая группа
              непрофессиональных прогнозистов систематически обгоняла даже аналитиков спецслужб по
              точности вероятностных прогнозов — во многом благодаря именно привычке регулярно
              проверять и пересматривать степень своей уверенности.</span
            >
          </div>
          <div class="fact">
            <b>Прямая рабочая параллель</b
            ><span
              >Оценка сроков и рисков проекта «с вероятностью 90%» на практике почти никогда не
              выполняется с такой частотой — те же узкие, самоуверенные интервалы, что и в этой
              игре.</span
            >
          </div>

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
