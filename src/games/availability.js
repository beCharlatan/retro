/* =========================================================
   GAME: Эвристика доступности (availability)
   4 questions instead of 1 — each a binary "what kills more"
   comparison. Same multi-question-screen pattern as
   calibration.js, but each screen is a simple toggle choice
   instead of a low/high range.

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   multiple repeated question screens generated from an array
   (QUESTIONS), same .toggle-pair pattern as false-consensus.js/
   prisoners-dilemma.js. Keeps all original plain ids
   (entry-body-N, next-btn-N, ...).

   One-continuous-scroll деталка — see framing.js for the full
   write-up of this layout and game-shell.js for the shared navigation
   helpers every game now uses.
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { AnswerTimerController } from '../controllers/answer-timer-controller.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { confirmExit, renderAnswerTimer, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_DOWNLOAD, ICON_LEFT, ICON_RIGHT, ICON_X } from '../icons.js';
import { countFilled, hasEnough, loadableDraft, patchItem } from '../logic/entries.js';
import { formatPercent, outcomeMark } from '../logic/format.js';
import { availabilityResults, availabilityRows } from '../logic/results.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

// Every question pairs a heavily covered news story of the last few
// years with a statistic that points the OTHER way — the "obvious"
// answer (the one the headlines trained you on) is wrong in all four.
// `correct` deliberately isn't always 'a' so the right answer can't be
// guessed from its position.
const QUESTIONS = [
  {
    text: 'В мае 2023 года ВОЗ объявила, что COVID-19 больше не чрезвычайная ситуация мирового масштаба. Что унесло больше жизней в мире за 2023 год: COVID-19 или туберкулёз?',
    short: 'COVID-19 или туберкулёз?',
    optA: 'COVID-19',
    optB: 'Туберкулёз',
    correct: 'b',
    reveal:
      'Туберкулёз: около 1,25 млн смертей в 2023 году (Global TB Report ВОЗ, 2024) — он снова стал главной инфекционной причиной смерти, обогнав COVID-19, зарегистрированная смертность от которого упала в разы.',
  },
  {
    text: '2023 и 2024 годы подряд бьют рекорды по жаре, новости полны «смертельной жарой». Что, по оценкам учёных, уносит больше жизней в мире за год: холод или жара?',
    short: 'Холод или жара?',
    optA: 'Холод',
    optB: 'Жара',
    correct: 'a',
    reveal:
      'Холод: по оценке исследования в The Lancet Planetary Health (2021) — около 4,6 млн смертей в год от холода против ~0,5 млн от жары, примерно 9 к 1. Жара при этом растёт, но пока не догнала.',
  },
  {
    text: 'Каждое лето новости полны историями об утонувших туристах — на курортах Турции, Египта, Таиланда. Что уносит больше жизней в мире за год: утопления или падения (с высоты, с лестниц, в быту)?',
    short: 'Утопления или падения?',
    optA: 'Утопления',
    optB: 'Падения',
    correct: 'b',
    reveal:
      'Падения: около 680 тыс. смертей в год (ВОЗ) — почти вдвое больше, чем утоплений (~300 тыс., ВОЗ, 2021). Падения — вторая по величине причина смерти от несчастных случаев после ДТП, но в заголовки попадают редко: они «бытовые», а не курортные.',
  },
  {
    text: 'США, 2022 год. Массовые стрельбы и ДТП — постоянные новости. Что унесло больше жизней в стране: огнестрельное оружие (включая самоубийства) или автомобильные аварии?',
    short: 'Оружие или автоаварии?',
    optA: 'Огнестрельное оружие',
    optB: 'Автоаварии',
    correct: 'a',
    reveal:
      'Огнестрельное оружие: ~48 тыс. смертей (CDC) против ~42,5 тыс. в ДТП (NHTSA). Чуть больше половины из них — самоубийства (~27 тыс.), которые почти не попадают в заголовки, в отличие от массовых стрельб.',
  },
];

const QUESTION_TIMER_SECONDS = 20;

const TOTAL_SCREENS = 3 + QUESTIONS.length; // instructions + Qn + results + context
const ROUND_TITLES = [
  'Что чаще убивает?',
  ...QUESTIONS.map((q) => q.short),
  'Что получилось у вашей команды',
  'Эвристика доступности',
];

export class RetroGameAvailability extends LitElement {
  static styles = sharedStyles;

  static properties = {
    entries: { state: true },
    draft: { state: true },
    results: { state: true },
    timerQ: { state: true },
    durations: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.entries = this._blankEntries();
    this.results = null;
    // One 20s timer shared by all question rounds; `timerQ` is the
    // question whose card is currently live (the rest show idle).
    this.timer = new AnswerTimerController(this, QUESTION_TIMER_SECONDS);
    this.timerQ = null;
    // Each question's own timer length — starts at the default, editable per question.
    this.durations = QUESTIONS.map(() => QUESTION_TIMER_SECONDS);

    this.draft = loadableDraft(Persist.load('availability'), {
      key: 'entries',
      length: this.names.length,
    });
  }

  _blankEntries() {
    return this.names.map((n) => ({ name: n, answers: QUESTIONS.map(() => null) }));
  }

  _restoreDraft() {
    this.flow.advance(1, () => {
      this.entries = this.draft.payload.entries;
      this.draft = null;
    });
  }

  _discardDraft() {
    Persist.clear('availability');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('availability');
    renderHome();
  }

  _onToggle(idx, qIdx, val) {
    this.entries = patchItem(this.entries, idx, 'answers', qIdx, val);
    Persist.save('availability', { entries: this.entries });
  }

  _filledCount(qIdx) {
    return countFilled(this.entries, (e) => e.answers[qIdx] !== null);
  }

  _startTimer(qIdx) {
    this.timerQ = qIdx;
    this.timer.start(this.durations[qIdx]);
  }

  // A new length for question `qIdx`'s timer. If that timer is the live
  // (idle or finished) one, it goes back to idle at the new length too.
  _setDuration(qIdx, seconds) {
    this.durations = this.durations.map((d, i) => (i === qIdx ? seconds : d));
    if (this.timerQ === qIdx) this.timer.setDuration(seconds);
  }

  _resetTimer() {
    this.timer.reset();
    this.timerQ = null;
  }

  _next(qIdx) {
    this._resetTimer();
    if (qIdx === QUESTIONS.length - 1) {
      this.flow.advance(1 + QUESTIONS.length, () => this._showResults());
    } else {
      this.flow.advance(2 + qIdx);
    }
  }

  _showResults() {
    this.results = availabilityResults(this.entries, QUESTIONS);

    ReportExport.register(
      'availability',
      {
        subtitle: 'Мы оцениваем риск по тому, что легче вспоминается, а не по статистике.',
        meta: ReportExport.meta(this.entries.length),
        explanation:
          'Мы оцениваем вероятность события по тому, насколько легко вспоминаются примеры, а не по реальной статистике — яркие, эмоциональные и часто освещаемые в новостях события кажутся значительно более частыми, чем есть на самом деле. Эффект описали Амос Тверски и Дэниел Канеман в статье 1973 года.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.entries = this._blankEntries();
    this.results = null;
    Persist.clear('availability');
    this.flow.reset();
    this._resetTimer();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  _questionScreen(qIdx) {
    const q = QUESTIONS[qIdx];
    const isLast = qIdx === QUESTIONS.length - 1;
    const nextLabel = isLast ? 'Показать результаты' : 'Следующий вопрос';
    const filled = this._filledCount(qIdx);
    return html`
      <section class="${this.flow.roundClass(1 + qIdx)}" id="round-${1 + qIdx}">
        <div class="round-body">
        <p class="eyebrow">Вопрос ${qIdx + 1} из ${QUESTIONS.length}</p>
        <h2>${q.text}</h2>
        <p class="lede">Интуитивный выбор — без подсчётов.</p>

        ${renderAnswerTimer(this.timer, {
          runningLabel: 'на ответ',
          compact: true,
          active: this.timerQ === qIdx,
          duration: this.durations[qIdx],
          defaultDuration: QUESTION_TIMER_SECONDS,
          onDurationChange: (seconds) => this._setDuration(qIdx, seconds),
          onStart: () => this._startTimer(qIdx),
          onReset: () => this._resetTimer(),
        })}

        <div class="entry-head toggle-only">
          <div>Участник</div>
          <div>Ответ</div>
        </div>
        <div id="entry-body-${qIdx}">
          ${this.entries.map((e, i) => {
            const ans = e.answers[qIdx];
            return html`
              <div class="entry-row toggle-only">
                <div class="name">${unsafeHTML(avatarName(e.name))}</div>
                <div class="toggle-pair">
                  <button
                    type="button"
                    data-val="a"
                    class="${ans === 'a' ? 'on' : ''}"
                    @click=${() => this._onToggle(i, qIdx, 'a')}
                  >
                    ${q.optA}
                  </button>
                  <button
                    type="button"
                    data-val="b"
                    class="${ans === 'b' ? 'on' : ''}"
                    @click=${() => this._onToggle(i, qIdx, 'b')}
                  >
                    ${q.optB}
                  </button>
                </div>
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
      <div class="wrap-wide" style=${gameAccentStyle('availability')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
          <p class="eyebrow">Командное упражнение · 6 минут</p>
          <h1>Что чаще убивает?</h1>
          <p class="lede">${QUESTIONS.length} коротких вопроса. Не гуглите — это про первое ощущение, а не про факты. Все вопросы — про громкие новости последних лет.</p>

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
                <span>На каждом экране — новая пара причин смерти. Зачитывайте вопрос целиком: новостной контекст — часть эксперимента.</span>
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Каждый молча выбирает вариант</b>
                <span>Первое, что приходит в голову — без подсчётов и споров с соседями.</span>
              </div>
            </li>
          </ol>

          <p class="note">Отвечайте интуитивно — колебания и «а давайте подумаем логически» смазывают эффект.</p>

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.flow.advance(1)}>Начать вопросы ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(0)}
        </section>

        ${QUESTIONS.map((_, i) => this._questionScreen(i))}

        <section class="${this.flow.roundClass(1 + QUESTIONS.length)}" id="round-${1 + QUESTIONS.length}">
          <div class="round-body">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>

          ${renderReveal({ value: r ? r.correctRate : '—', ...REVEAL_COPY.availability(r ? { totalCorrect: r.totalCorrect, totalAnswered: r.totalAnswered, worst: r.worst, questionCount: QUESTIONS.length } : null) })}

          <div class="stat-row">
            ${
              r
                ? r.perQuestionStats.map(
                    (s, qi) => html`
                    <div class="stat">
                      <div class="n">${s.pct}%</div>
                      <div class="lab">верно в вопросе ${qi + 1}</div>
                    </div>
                  `,
                  )
                : ''
            }
          </div>

          <div>
            ${
              r
                ? QUESTIONS.map(
                    (q, i) => html`
                    <div class="fact">
                      <b>Вопрос ${i + 1}: ${q.optA} vs ${q.optB}</b><span>${q.reveal}</span>
                    </div>
                  `,
                  )
                : ''
            }
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                ${QUESTIONS.map((_, i) => html`<th>В${i + 1}</th>`)}
                <th>Верно</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? availabilityRows(this.entries, QUESTIONS).map(
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
            <button class="ghost" @click=${() => this.flow.scrollTo(QUESTIONS.length)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.flow.advance(2 + QUESTIONS.length)}>
              Что это было? ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(1 + QUESTIONS.length)}
        </section>

        <section class="${this.flow.roundClass(2 + QUESTIONS.length)}" id="round-${2 + QUESTIONS.length}">
          <div class="round-body">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Эвристика доступности</h1>
          <p class="lede">
            Мы оцениваем вероятность события по тому, насколько легко вспоминаются примеры — а не
            по реальной статистике.
          </p>

          <p>
            Яркие, эмоциональные и часто освещаемые в новостях события кажутся более частыми, чем
            есть на самом деле. Авиакатастрофы, убийства и теракты — редкие, но заметные и
            подробно освещаемые трагедии, поэтому нам легко их «вспомнить» и представить. Туберкулёз,
            холод, падения и автоаварии почти никогда не становятся сенсацией — хотя уносят
            значительно больше жизней.
          </p>

          <p>
            Эффект описан в статье Tversky A., Kahneman D. (1973). Availability: A Heuristic for
            Judging Frequency and Probability. <i>Cognitive Psychology</i>, 5(2). В той же работе
            показано, что люди систематически считают, будто смертей от убийств больше, чем от
            диабета — хотя в реальности всё наоборот, и это же самое вы, возможно, только что
            увидели на своей команде.
          </p>

          <p>
            <b>Почему мозг так поступает.</b> Оценить точную статистику причин смерти — трудная
            задача, требующая доступа к данным, которых у нас обычно нет. Вместо этого мозг
            подменяет сложный вопрос («как часто это происходит на самом деле?») на простой и
            быстрый («как легко мне вспомнить примеры?») — и отвечает на него, а не на исходный.
            Это экономит усилия и в большинстве бытовых ситуаций работает неплохо: то, что
            происходит часто, мы действительно чаще видим и слышим. Но механизм ломается, когда
            частота упоминания и реальная частота события расходятся — а именно так работают
            новости: они рассказывают не о типичном, а о редком и шокирующем, потому что типичное
            неинтересно.
          </p>

          <hr />
          <h2>Ещё немного фактов</h2>

          <div class="fact">
            <b>Тот же механизм — в страхе перед перелётами</b
            ><span
              >Статистически поездка на машине до аэропорта обычно опаснее самого перелёта, но
              полёт вызывает у многих куда больше тревоги — потому что авиакатастрофы ярче
              «доступны» в памяти.</span
            >
          </div>
          <div class="fact">
            <b>Москиты — самое смертоносное животное на Земле</b
            ><span
              >Ни акулы, ни змеи, ни крокодилы не убивают столько людей в год, сколько
              переносимые москитами болезни — но именно акулы вызывают у людей несоразмерно
              больше страха.</span
            >
          </div>
          <div class="fact">
            <b>После крупных катастроф люди массово меняют поведение</b
            ><span
              >После резонансных терактов или крушений самолётов число людей, выбирающих машину
              вместо самолёта, заметно растёт на несколько месяцев — статистически это делает
              поездку опаснее, а не безопаснее, потому что автомобильные аварии убивают намного
              больше людей на километр пути.</span
            >
          </div>
          <div class="fact">
            <b>Эффект усиливают недавность и личный опыт</b
            ><span
              >Событие, свидетелем которого вы были лично или которое произошло совсем недавно,
              «доступается» из памяти легче и заметнее искажает оценку вероятности, чем то же
              событие, о котором вы просто где-то читали давно.</span
            >
          </div>
          <div class="fact">
            <b>Влияет на страхование и здравоохранение</b
            ><span
              >Люди охотнее покупают страховку от оползней или наводнений сразу после катастрофы
              в новостях, чем спустя год — хотя объективная вероятность бедствия за это время не
              изменилась, просто пример стал не таким «доступным».</span
            >
          </div>
          <div class="fact">
            <b>Рабочее применение</b
            ><span
              >В проектах мы точно так же переоцениваем риски, о которых недавно громко говорили
              (последний инцидент, свежий баг в проде), и недооцениваем тихие, скучные, но более
              вероятные проблемы.</span
            >
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
            <span></span>
          </div>
          </div>
          ${this.flow.lock(2 + QUESTIONS.length)}
        </section>
          </div>

          <aside class="game-rail">
            <div class="game-rail-title">Эвристика доступности</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'availability',
              stepLabels: ROUND_TITLES,
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-availability', RetroGameAvailability);
