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
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_LEFT, ICON_PRINT, ICON_RIGHT } from '../icons.js';
import { Persist, timeAgo } from '../persist.js';
import { Print } from '../print.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const QUESTIONS = [
  {
    text: 'Что, по-вашему, ежегодно убивает больше людей в мире: удары молнии или авиакатастрофы?',
    optA: 'Молния',
    optB: 'Авиакатастрофы',
    correct: 'a',
    reveal:
      'Молния: по оценкам метеослужб — около 24 000 смертей в мире в год, тогда как жертвы авиакатастроф исчисляются несколькими сотнями.',
  },
  {
    text: 'Что чаще становится причиной смерти: диабет или убийство?',
    optA: 'Диабет',
    optB: 'Убийство',
    correct: 'a',
    reveal:
      'Диабет: по данным ВОЗ, от него ежегодно умирает около 1,5–2 млн человек в мире — в разы больше, чем от убийств (~400 тыс.).',
  },
  {
    text: 'Кто чаще становится причиной смерти человека: москиты (через малярию и другие болезни) или акулы?',
    optA: 'Москиты',
    optB: 'Акулы',
    correct: 'a',
    reveal:
      'Москиты: переносимые ими болезни убивают порядка 700 000+ человек в год — против 5–10 смертей от акул. Разрыв на пять порядков.',
  },
  {
    text: 'Что чаще убивает: автомобильные аварии или теракты?',
    optA: 'Автоаварии',
    optB: 'Теракты',
    correct: 'a',
    reveal:
      'Автоаварии: около 1,2 млн смертей в мире в год (ВОЗ) — на порядки больше, чем от терактов в любой отдельно взятый год.',
  },
];

const TOTAL_SCREENS = 3 + QUESTIONS.length; // instructions + Qn + results + context

export class RetroGameAvailability extends LitElement {
  static styles = sharedStyles;

  static properties = {
    screenIdx: { state: true },
    entries: { state: true },
    draft: { state: true },
    results: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.screenIdx = 0;
    this.entries = this._blankEntries();
    this.results = null;

    const loaded = Persist.load('availability');
    this.draft =
      loaded &&
      Array.isArray(loaded.payload.entries) &&
      loaded.payload.entries.length === this.names.length
        ? loaded
        : null;
  }

  _blankEntries() {
    return this.names.map((n) => ({ name: n, answers: QUESTIONS.map(() => null) }));
  }

  goTo(idx) {
    this.screenIdx = idx;
  }

  _restoreDraft() {
    this.entries = this.draft.payload.entries;
    this.draft = null;
    this.goTo(1);
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
    this.entries = this.entries.map((e, i) =>
      i === idx ? { ...e, answers: e.answers.map((a, ai) => (ai === qIdx ? val : a)) } : e,
    );
    Persist.save('availability', { entries: this.entries });
  }

  _filledCount(qIdx) {
    return this.entries.filter((e) => e.answers[qIdx] !== null).length;
  }

  _next(qIdx) {
    if (qIdx === QUESTIONS.length - 1) {
      this._showResults();
    } else {
      this.goTo(2 + qIdx);
    }
  }

  _showResults() {
    const correctPerQuestion = QUESTIONS.map(() => 0);
    let totalCorrect = 0,
      totalAnswered = 0;

    this.entries.forEach((e) => {
      QUESTIONS.forEach((q, qi) => {
        const ans = e.answers[qi];
        if (ans === null) return;
        totalAnswered++;
        if (ans === q.correct) {
          correctPerQuestion[qi]++;
          totalCorrect++;
        }
      });
    });

    const correctRate = totalAnswered
      ? Math.round((totalCorrect / totalAnswered) * 100) + '%'
      : '—';

    const perQuestionStats = QUESTIONS.map((q, qi) => {
      const answered = this.entries.filter((e) => e.answers[qi] !== null).length;
      const pct = answered ? Math.round((correctPerQuestion[qi] / answered) * 100) : 0;
      return { pct };
    });

    this.results = { correctRate, perQuestionStats };

    Print.mount(
      'print-header-availability',
      {
        title: 'Эвристика доступности',
        subtitle: 'Мы оцениваем риск по тому, что легче вспоминается, а не по статистике.',
        meta: Print.meta(this.entries.length),
        explanation:
          'Мы оцениваем вероятность события по тому, насколько легко вспоминаются примеры, а не по реальной статистике — яркие, эмоциональные и часто освещаемые в новостях события кажутся значительно более частыми, чем есть на самом деле. Эффект описали Амос Тверски и Дэниел Канеман в статье 1973 года.',
      },
      this.renderRoot,
    );

    this.goTo(1 + QUESTIONS.length);
  }

  _reset() {
    this.entries = this._blankEntries();
    this.results = null;
    Persist.clear('availability');
    this.goTo(0);
  }

  _questionScreen(qIdx) {
    const q = QUESTIONS[qIdx];
    const isLast = qIdx === QUESTIONS.length - 1;
    const nextLabel = isLast ? 'Показать результаты' : 'Следующий вопрос';
    const filled = this._filledCount(qIdx);
    return html`
      <section class="screen ${this.screenIdx === 1 + qIdx ? 'active' : ''}">
        <p class="eyebrow">Вопрос ${qIdx + 1} из ${QUESTIONS.length}</p>
        <h2>${q.text}</h2>
        <p class="lede">Интуитивный выбор — без подсчётов.</p>

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
          <button class="ghost" @click=${() => this.goTo(qIdx)}>${unsafeHTML(ICON_LEFT)} Назад</button>
          <button
            class="primary"
            id="next-btn-${qIdx}"
            ?disabled=${filled < 2}
            @click=${() => this._next(qIdx)}
          >
            ${nextLabel} ${unsafeHTML(ICON_RIGHT)}
          </button>
        </div>
      </section>
    `;
  }

  render() {
    const r = this.results;

    return html`
      <div class="wrap narrow">
        <div class="game-crumb">
          <button class="back-link" @click=${this._goHome}>${unsafeHTML(ICON_LEFT)} Все игры</button>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">Эвристика доступности</span>
        </div>
        <div class="progress">
          ${Array.from(
            { length: TOTAL_SCREENS },
            (_, i) => html`
              <div
                class="dot ${i === this.screenIdx ? 'active' : ''} ${i < this.screenIdx ? 'done' : ''}"
              ></div>
            `,
          )}
        </div>

        <section class="screen ${this.screenIdx === 0 ? 'active' : ''}">
          <p class="eyebrow">Командное упражнение · 6 минут</p>
          <h1>Что чаще убивает?</h1>
          <p class="lede">${QUESTIONS.length} коротких вопроса. Не гуглите — это про первое ощущение, а не про факты.</p>

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
                <span>На каждом экране — новая пара причин смерти. Спрашивайте по одной.</span>
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
            <button class="primary" @click=${() => this.goTo(1)}>Начать вопросы ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
        </section>

        ${QUESTIONS.map((_, i) => this._questionScreen(i))}

        <section class="screen ${this.screenIdx === 1 + QUESTIONS.length ? 'active' : ''}">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>
          <div class="print-header" id="print-header-availability"></div>

          <div class="reveal">
            <div class="n">${r ? r.correctRate : '—'}</div>
            <p>
              <b>Доля интуитивно верных ответов</b> по всей команде — по всем ${QUESTIONS.length}
              вопросам сразу.
            </p>
          </div>

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
                  ? this.entries.map((e) => {
                      let hits = 0,
                        answered = 0;
                      const cells = QUESTIONS.map((q, qi) => {
                        const ans = e.answers[qi];
                        if (ans === null) return html`<td>—</td>`;
                        answered++;
                        const hit = ans === q.correct;
                        if (hit) hits++;
                        return html`<td>${hit ? '✓' : '✕'}</td>`;
                      });
                      const pctText = answered ? Math.round((hits / answered) * 100) + '%' : '—';
                      return html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(e.name))}</td>
                        ${cells}
                        <td>${pctText}</td>
                      </tr>
                    `;
                    })
                  : ''
              }
            </tbody>
          </table>

          <div class="print-footer" id="print-footer-availability"></div>

          <div class="pdf-row">
            <button class="ghost" id="pdf-btn" @click=${() => Print.run()}>
              ${unsafeHTML(ICON_PRINT)} Сохранить / отправить PDF
            </button>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(QUESTIONS.length)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.goTo(2 + QUESTIONS.length)}>
              Что это было? ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 2 + QUESTIONS.length ? 'active' : ''}">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Эвристика доступности</h1>
          <p class="lede">
            Мы оцениваем вероятность события по тому, насколько легко вспоминаются примеры — а не
            по реальной статистике.
          </p>

          <p>
            Яркие, эмоциональные и часто освещаемые в новостях события кажутся более частыми, чем
            есть на самом деле. Авиакатастрофы, убийства и теракты — редкие, но заметные и
            подробно освещаемые трагедии, поэтому нам легко их «вспомнить» и представить. Молнии,
            диабет, малярия и автоаварии почти никогда не становятся сенсацией — хотя уносят
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
        </section>
      </div>
    `;
  }
}

customElements.define('retro-game-availability', RetroGameAvailability);
