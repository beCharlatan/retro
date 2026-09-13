/* =========================================================
   GAME: Эффект ложного консенсуса (false-consensus)

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   same pattern as crowd-wisdom (custom question) plus the first game
   using .toggle-pair (Да/Нет) buttons instead of number inputs. Keeps
   its original plain ids, same reasoning as crowd-wisdom's header
   comment. The privacy blur-on-click-then-hide mechanism for
   .toggle-pair is a document-level delegated listener
   (src/privacy-mask.js) — it had to be fixed to use
   e.composedPath()[0] instead of e.target to keep working for a
   Shadow DOM game's buttons (event retargeting across the shadow
   boundary means a document-level listener sees e.target as the
   custom element host, not the actual button clicked inside it).
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_LEFT, ICON_RIGHT } from '../icons.js';
import { Persist, timeAgo } from '../persist.js';
import { Print } from '../print.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const DEFAULT_QUESTION =
  'Готовы ли вы прямо сейчас, без подготовки, провести 5-минутную презентацию перед всей командой?';
const TOTAL_SCREENS = 4;

export class RetroGameFalseConsensus extends LitElement {
  static styles = sharedStyles;

  static properties = {
    screenIdx: { state: true },
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
    this.screenIdx = 0;
    this.data = this._blankData();
    this.results = null;
    this.question = DEFAULT_QUESTION;
    this.isCustomQuestion = false;
    this.customPanelOpen = false;
    this.customQStatus = '';

    const loaded = Persist.load('false-consensus');
    this.draft =
      loaded &&
      Array.isArray(loaded.payload.data) &&
      loaded.payload.data.length === this.names.length
        ? loaded
        : null;
  }

  _blankData() {
    return this.names.map((n) => ({ name: n, own: null, estimate: null }));
  }

  goTo(idx) {
    this.screenIdx = idx;
  }

  _restoreDraft() {
    this.data = this.draft.payload.data;
    if (this.draft.payload.question) {
      this.question = this.draft.payload.question;
      this.isCustomQuestion = true;
    }
    this.draft = null;
    this.goTo(1);
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
    const text = this.renderRoot.getElementById('custom-q-text').value.trim();
    if (!text) {
      this.customQStatus = 'Впишите текст вопроса.';
      return;
    }
    this.question = text;
    this.isCustomQuestion = true;
    this.customQStatus = '✓ Вопрос обновлён.';
  }

  _resetCustomQuestion() {
    this.question = DEFAULT_QUESTION;
    this.isCustomQuestion = false;
    this.customQStatus = '✓ Вернули стандартный вопрос.';
    this.renderRoot.getElementById('custom-q-text').value = '';
  }

  _persist() {
    Persist.save('false-consensus', {
      data: this.data,
      question: this.isCustomQuestion ? this.question : null,
    });
  }

  _onToggle(idx, val) {
    this.data = this.data.map((row, i) => (i === idx ? { ...row, own: val } : row));
    this._persist();
  }

  _onEstimateInput(e, idx) {
    let v = e.target.value === '' ? null : Number(e.target.value);
    if (v !== null) {
      if (v < 0) v = 0;
      if (v > 100) v = 100;
    }
    this.data = this.data.map((row, i) => (i === idx ? { ...row, estimate: v } : row));
    this._persist();
  }

  _filledCount() {
    return this.data.filter((d) => d.own !== null && d.estimate !== null).length;
  }

  _showResults() {
    const filled = this.data.filter((d) => d.own !== null && d.estimate !== null);
    const yesCount = filled.filter((d) => d.own === 'yes').length;
    const realYesPct = Math.round((yesCount / filled.length) * 100);

    const yesSide = filled.filter((d) => d.own === 'yes');
    const noSide = filled.filter((d) => d.own === 'no');
    const avg = (arr) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b.estimate, 0) / arr.length) : null;
    const yesAvg = avg(yesSide);
    const noAvg = avg(noSide);

    let compareText = `Реально ответили «да» ${realYesPct}% команды.`;
    if (yesAvg !== null && noAvg !== null) {
      compareText += ` Те, кто сам сказал «да», в среднем ожидали ${yesAvg}% согласных — те, кто сказал «нет», ожидали только ${noAvg}%. Каждая группа тянет прогноз в свою сторону.`;
    }

    this.results = { filled, realYesPct, yesAvg, noAvg, compareText };

    Print.mount(
      'print-header-false-consensus',
      {
        title: 'Ложный консенсус',
        subtitle: this.isCustomQuestion
          ? this.question
          : 'Мы уверены, что наше мнение разделяют куда больше людей, чем на самом деле.',
        meta: Print.meta(filled.length),
        explanation:
          'Мы систематически переоцениваем, насколько остальные разделяют наше собственное мнение или поведение — потому что единственная реальная точка отсчёта, которая у нас есть, это мы сами. Эффект описали психологи Ли Росс, Дэвид Грин и Памела Хаус в серии экспериментов в Стэнфорде в 1977 году.',
      },
      this.renderRoot,
    );

    this.goTo(2);
  }

  _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear('false-consensus');
    this.goTo(0);
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
      <div class="wrap narrow">
        <div class="game-crumb">
          <button class="back-link" @click=${this._goHome}>${unsafeHTML(ICON_LEFT)} Все игры</button>
          <span class="crumb-sep">/</span>
          <span class="crumb-current">Ложный консенсус</span>
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

          <ol class="step-list">
            <li>
              <div class="step-num">1</div>
              <div class="step-body">
                <b>Задайте вопрос вслух</b>
                <span id="fc-question-text">«${this.question}» Каждый отвечает про себя: да или нет.</span>
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Каждый оценивает команду</b>
                <span
                  >Теперь — какой процент всей команды, по-вашему, тоже ответит «да»? Число от 0
                  до 100.</span
                >
              </div>
            </li>
          </ol>

          <p class="note">
            Отвечайте на первый вопрос до того, как думать над вторым — не пересчитывайте назад.
          </p>

          <div class="custom-q-toggle-row">
            <button type="button" class="ghost" id="custom-q-toggle" @click=${() => this._toggleCustomPanel()}>
              ✏️ Задать свой вопрос вместо стандартного
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
                class="ghost"
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
            <button class="primary" @click=${() => this.goTo(1)}>Вносить данные ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 1 ? 'active' : ''}">
          <p class="eyebrow">Сбор данных</p>
          <h2>Впишите ответы каждого участника</h2>
          <p class="lede">Свой ответ (да/нет) и оценку, какой % команды тоже скажет «да».</p>

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
            <button class="ghost" @click=${() => this.goTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" ?disabled=${filled < 2} @click=${() => this._showResults()}>
              Показать результаты ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 2 ? 'active' : ''}">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>
          <div class="print-header" id="print-header-false-consensus"></div>

          <div class="reveal">
            <div class="n" id="real-yes">${r ? r.realYesPct + '%' : '—'}</div>
            <p>
              <b>Реальная доля ответивших «да»</b> в вашей команде — именно с этим числом сейчас
              сравним чужие прогнозы.
            </p>
          </div>

          <div class="group-compare">
            <div class="g low">
              <div class="t">Средний прогноз у тех, кто сам сказал «да»</div>
              <div class="v" id="yes-side-avg">${r && r.yesAvg !== null ? r.yesAvg + '%' : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Средний прогноз у тех, кто сам сказал «нет»</div>
              <div class="v" id="no-side-avg">${r && r.noAvg !== null ? r.noAvg + '%' : '—'}</div>
            </div>
          </div>

          <p id="fc-compare-text">${r ? r.compareText : ''}</p>

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

          <div class="print-footer" id="print-footer-false-consensus"></div>

          <div class="pdf-row">
            <button class="ghost" id="pdf-btn" @click=${() => Print.run()}>
              🖨️ Сохранить / отправить PDF
            </button>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.goTo(1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.goTo(3)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 3 ? 'active' : ''}">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Эффект ложного консенсуса</h1>
          <p class="lede">
            Мы систематически переоцениваем, насколько остальные разделяют наше собственное
            мнение или поведение.
          </p>

          <p>
            В 1977 году психологи Ли Росс, Дэвид Грин и Памела Хаус провели серию опытов в
            Стэнфорде. В одном из них студентам предлагали (по желанию) походить по кампусу с
            рекламным щитом «Ешьте в Joe's» — и заранее спрашивали, какой процент других
            студентов, по их мнению, тоже на это согласится.
          </p>

          <div class="stat-row">
            <div class="stat">
              <div class="n">~62%</div>
              <div class="lab">ожидаемая согласившимися доля студентов, которые тоже согласятся</div>
            </div>
            <div class="stat">
              <div class="n">~33%</div>
              <div class="lab">ожидаемая отказавшимися доля студентов, которые согласятся</div>
            </div>
          </div>

          <p>
            Обе группы студентов были уверены, что большинство поступит так же, как они сами —
            просто в разные стороны. Работа опубликована как Ross L., Greene D., House P. (1977).
            The False Consensus Effect: An Egocentric Bias in Social Perception and Attribution
            Processes. <i>Journal of Experimental Social Psychology</i>.
          </p>

          <p>
            <b>Откуда берётся искажение.</b> Когда мы прогнозируем чужое мнение, у нас нет доступа
            к головам других людей — единственная реальная точка отсчёта, которая есть под рукой,
            это наше собственное мнение. Мозг использует его как черновой шаблон: «раз я так
            думаю, и мои причины кажутся мне разумными, то и другие, скорее всего, придут к тому
            же выводу». Это быстрый и в целом полезный способ прогноза — в большинстве повседневных
            ситуаций люди вокруг нас действительно часто думают похоже. Проблема в том, что мозг
            не делает скидку на то, что сам является участником оценки: собственная позиция
            используется не как один из голосов, а как эталон, вокруг которого мысленно строится
            вся остальная популяция.
          </p>

          <hr />
          <h2>Ещё немного фактов</h2>

          <div class="fact">
            <b>Отчасти это не иллюзия, а реальность локального пузыря</b
            ><span
              >Мы дружим и работаем с похожими на себя людьми — поэтому в нашем непосредственном
              окружении консенсус вокруг нашего мнения зачастую и правда выше среднего по
              популяции, что делает искажение ещё труднее заметить.</span
            >
          </div>
          <div class="fact">
            <b>Эффект усиливается для морально окрашенных вопросов</b
            ><span
              >Чем сильнее мы уверены, что наша позиция «единственно правильная», тем выше мы
              склонны переоценивать долю согласных с нами — эффект слабее для нейтральных
              фактических вопросов.</span
            >
          </div>
          <div class="fact">
            <b>Работает и в обратную сторону — для меньшинств</b
            ><span
              >Люди с редкими привычками или взглядами иногда, наоборот, недооценивают, сколько
              единомышленников у них есть — потому что молчаливое большинство вокруг создаёт
              впечатление, что «таких, как я, почти нет».</span
            >
          </div>
          <div class="fact">
            <b>Соцсети усиливают эффект</b
            ><span
              >Алгоритмические ленты показывают нам контент, похожий на то, что мы уже
              поддерживаем — из-за этого ощущение «все согласны со мной» может расти даже без
              реального роста согласия в обществе.</span
            >
          </div>
          <div class="fact">
            <b>Прямое приложение к работе</b
            ><span
              >«Всем же очевидно, что нужно делать именно так» — одна из самых частых форм
              ложного консенсуса в рабочих спорах; стоит явно спросить мнение команды, а не
              полагаться на ощущение всеобщего согласия.</span
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

customElements.define('retro-game-false-consensus', RetroGameFalseConsensus);
