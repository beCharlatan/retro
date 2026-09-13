/* =========================================================
   GAME: Ошибка планирования (planning-fallacy)

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   same solo two-field-per-row pattern as anchoring.js, but without a
   chart. Keeps its original plain ids.
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_LEFT, ICON_RIGHT } from '../icons.js';
import { Persist, timeAgo } from '../persist.js';
import { Print } from '../print.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const TOTAL_SCREENS = 4;

export class RetroGamePlanningFallacy extends LitElement {
  static styles = sharedStyles;

  static properties = {
    screenIdx: { state: true },
    data: { state: true },
    draft: { state: true },
    results: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.screenIdx = 0;
    this.data = this._blankData();
    this.results = null;

    const loaded = Persist.load('planning-fallacy');
    this.draft =
      loaded &&
      Array.isArray(loaded.payload.data) &&
      loaded.payload.data.length === this.names.length
        ? loaded
        : null;
  }

  _blankData() {
    return this.names.map((n) => ({ name: n, best: null, actual: null }));
  }

  goTo(idx) {
    this.screenIdx = idx;
  }

  _restoreDraft() {
    this.data = this.draft.payload.data;
    this.draft = null;
    this.goTo(1);
  }

  _discardDraft() {
    Persist.clear('planning-fallacy');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('planning-fallacy');
    renderHome();
  }

  _onEntryInput(e, idx, field) {
    let v = e.target.value === '' ? null : Number(e.target.value);
    if (v !== null && v < 0) v = 0;
    this.data = this.data.map((row, i) => (i === idx ? { ...row, [field]: v } : row));
    Persist.save('planning-fallacy', { data: this.data });
  }

  _filledCount() {
    return this.data.filter((d) => d.best !== null && d.actual !== null && d.best > 0).length;
  }

  _showResults() {
    const filled = this.data.filter((d) => d.best !== null && d.actual !== null && d.best > 0);
    const ratios = filled.map((d) => d.actual / d.best);
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const accurateCount = ratios.filter((r) => r < 1.3).length;
    const overrunCount = ratios.filter((r) => r > 1.5).length;

    this.results = { filled, avgRatio, accurateCount, overrunCount };

    Print.mount(
      'print-header-planning-fallacy',
      {
        title: 'Ошибка планирования',
        subtitle: '«В лучшем случае» и «по факту» — почти никогда не одно и то же число.',
        meta: Print.meta(filled.length),
        explanation:
          'Люди систематически недооценивают, сколько времени займёт задача, даже прекрасно помня, что прошлые похожие задачи тоже заняли больше запланированного. Термин ввели Дэниел Канеман и Амос Тверски в 1977–1979 годах; классический разбор — исследование Roger Buehler, Dale Griffin и Michael Ross (1994) о студентах и сроках дипломных работ.',
      },
      this.renderRoot,
    );

    this.goTo(2);
  }

  _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear('planning-fallacy');
    this.goTo(0);
  }

  _entryRow(row, idx) {
    return html`
      <div class="entry-row">
        <div class="name">${unsafeHTML(avatarName(row.name))}</div>
        <input
          type="number"
          min="0"
          step="0.5"
          inputmode="decimal"
          placeholder="напр. 4"
          .value=${row.best ?? ''}
          @input=${(e) => this._onEntryInput(e, idx, 'best')}
        />
        <input
          type="number"
          min="0"
          step="0.5"
          inputmode="decimal"
          placeholder="напр. 9"
          .value=${row.actual ?? ''}
          @input=${(e) => this._onEntryInput(e, idx, 'actual')}
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
          <span class="crumb-current">Ошибка планирования</span>
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
          <h1>Сколько времени это на самом деле занимает?</h1>
          <p class="lede">
            Два числа на человека. Отвечайте по-честному, вспоминая реальные задачи, а не
            идеальный сценарий.
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
                <b>Вспомните типичную рабочую задачу</b>
                <span
                  >Что-то на «примерно один день» по вашей же собственной оценке — тикет, фича,
                  отчёт, что угодно рутинное.</span
                >
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Назовите два числа в часах</b>
                <span
                  >Сколько эта задача занимает <b>в лучшем случае</b>, если всё идёт по плану — и
                  сколько занимает <b>по факту в среднем</b>, если вспомнить последние похожие
                  задачи.</span
                >
              </div>
            </li>
          </ol>

          <p class="note">Первым называйте «лучший случай» — не подглядывайте вперёд на «по факту».</p>

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.goTo(1)}>Вносить данные ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
        </section>

        <section class="screen ${this.screenIdx === 1 ? 'active' : ''}">
          <p class="eyebrow">Сбор данных</p>
          <h2>Впишите оценки каждого участника</h2>
          <p class="lede">В часах: «лучший случай» и «по факту в среднем».</p>

          <div class="entry-head">
            <div>Участник</div>
            <div>Лучший случай, ч</div>
            <div>По факту, ч</div>
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
          <div class="print-header" id="print-header-planning-fallacy"></div>

          <div class="reveal">
            <div class="n">${r ? r.avgRatio.toFixed(2) + '×' : '—'}</div>
            <p>
              <b>В среднем по команде</b> факт превышает «лучший случай» именно во столько раз —
              и это никого не должно удивлять, так работает почти у всех.
            </p>
          </div>

          <div class="group-compare">
            <div class="g low">
              <div class="t">Превышение меньше чем в 1.3 раза</div>
              <div class="v">${r ? r.accurateCount + ' из ' + r.filled.length : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Превышение больше чем в 1.5 раза</div>
              <div class="v">${r ? r.overrunCount + ' из ' + r.filled.length : '—'}</div>
            </div>
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Лучший случай</th>
                <th>По факту</th>
                <th>Во сколько раз</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.filled.map((d) => {
                      const ratio = d.actual / d.best;
                      return html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                        <td>${d.best} ч</td>
                        <td>${d.actual} ч</td>
                        <td>${ratio.toFixed(2)}×</td>
                      </tr>
                    `;
                    })
                  : ''
              }
            </tbody>
          </table>

          <div class="print-footer" id="print-footer-planning-fallacy"></div>

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
          <h1>Ошибка планирования</h1>
          <p class="lede">
            Люди систематически недооценивают, сколько времени займёт задача — даже прекрасно
            помня, что прошлые похожие задачи тоже заняли больше, чем планировалось.
          </p>

          <p>
            Термин ввели Дэниел Канеман и Амос Тверски в 1977–1979 годах. Классический
            экспериментальный разбор — исследование Roger Buehler, Dale Griffin и Michael Ross
            (1994): студентов, пишущих дипломную работу, попросили дать реалистичный прогноз
            срока сдачи и отдельно — «наихудший сценарий, если вдруг всё пойдёт не так». У
            большинства студентов фактическое время превысило даже их собственный наихудший
            прогноз.
          </p>

          <p>
            Работа опубликована как Buehler R., Griffin D., Ross M. (1994). Exploring the
            "Planning Fallacy": Why People Underestimate Their Task Completion Times.
            <i>Journal of Personality and Social Psychology</i>.
          </p>

          <p>
            <b>Почему «лучший случай» обманывает даже опытных людей.</b> Когда мы планируем
            задачу, мозг мысленно проигрывает сценарий «всё идёт по плану»: открыл задачу, сделал,
            закрыл — без учёта того, что может пойти не так. Канеман называл это «внутренним
            взглядом» (inside view) — мы фокусируемся на конкретном плане перед глазами, а не на
            статистике всех похожих задач, которые нам приходилось делать раньше («внешний
            взгляд», outside view). Проблема в том, что реальные задачи почти всегда включают
            непредвиденные мелочи — не потому что мы плохо планируем именно этот случай, а потому
            что «что-то пойдёт не так» в принципе статистически вероятно почти всегда, просто
            каждый раз по-своему. Мозг учитывает конкретные препятствия, которые может представить
            заранее, но не умеет заранее представить препятствие, о существовании которого пока не
            знает.
          </p>

          <hr />
          <h2>Ещё немного фактов</h2>

          <div class="fact">
            <b>Знание об ошибке не спасает от неё</b
            ><span
              >«Inside view» — попытка представить именно эту задачу заново — почти всегда
              побеждает статистику прошлых похожих задач, даже когда сам человек прекрасно знает
              об этом искажении.</span
            >
          </div>
          <div class="fact">
            <b>Единственное, что реально помогает — reference class forecasting</b
            ><span
              >Сознательно смотреть не «сколько эта задача займёт», а «сколько в среднем занимали
              похожие задачи раньше» — и планировать от этого числа, а не от воображаемого
              идеального сценария.</span
            >
          </div>
          <div class="fact">
            <b>Крупные проекты страдают систематически</b
            ><span
              >Исследования масштабных инфраструктурных проектов (авторства экономиста Бента
              Фливбьорга) показывают, что реальные сроки и бюджеты крупных строек — от туннелей до
              олимпийских объектов — систематически превышают первоначальные оценки, причём
              разброс превышения десятилетиями остаётся примерно одинаковым.</span
            >
          </div>
          <div class="fact">
            <b>Дробление задачи снижает искажение</b
            ><span
              >Если разбить крупную задачу на мелкие подзадачи и оценивать каждую отдельно,
              суммарная оценка обычно получается точнее, чем одна общая оценка «на глаз» — мелкие
              шаги труднее мысленно представить как безупречные.</span
            >
          </div>
          <div class="fact">
            <b>Оптимизм и социальное давление усиливают эффект</b
            ><span
              >Люди дают более оптимистичные (то есть более неточные) прогнозы, когда знают, что
              оценку увидят коллеги или начальство — называть большую цифру социально «неудобно»,
              даже если она честнее.</span
            >
          </div>
          <div class="fact">
            <b>Прямая параллель со спринтами</b
            ><span
              >Оценка в story points или часах на глаз почти всегда описывает «лучший случай» —
              отсюда системное расхождение между оценкой в начале спринта и тем, что происходит на
              самом деле.</span
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

customElements.define('retro-game-planning-fallacy', RetroGamePlanningFallacy);
