/* =========================================================
   GAME: Ошибка планирования (planning-fallacy)

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   same solo two-field-per-row pattern as anchoring.js, but without a
   chart. Keeps its original plain ids.
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { confirmExit, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_DOWNLOAD, ICON_LEFT, ICON_RIGHT, ICON_X } from '../icons.js';
import {
  countFilled,
  hasEnough,
  loadableDraft,
  parseNumberInput,
  patchRow,
} from '../logic/entries.js';
import { isUsablePlanningRow, planningFallacyResults, planningRatio } from '../logic/results.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const TOTAL_SCREENS = 4;
const ROUND_TITLES = [
  'Сколько времени это на самом деле занимает?',
  'Впишите оценки каждого участника',
  'Что получилось у вашей команды',
  'Ошибка планирования',
];

export class RetroGamePlanningFallacy extends LitElement {
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

    this.draft = loadableDraft(Persist.load('planning-fallacy'), {
      key: 'data',
      length: this.names.length,
    });
  }

  _blankData() {
    return this.names.map((n) => ({ name: n, best: null, actual: null }));
  }

  _restoreDraft() {
    this.flow.advance(1, () => {
      this.data = this.draft.payload.data;
      this.draft = null;
    });
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
    this.data = patchRow(this.data, idx, {
      [field]: parseNumberInput(e.target.value, { min: 0 }),
    });
    Persist.save('planning-fallacy', { data: this.data });
  }

  _filledCount() {
    return countFilled(this.data, isUsablePlanningRow);
  }

  _showResults() {
    this.results = planningFallacyResults(this.data);
    const { filled } = this.results;

    ReportExport.register(
      'planning-fallacy',
      {
        subtitle: '«В лучшем случае» и «по факту» — почти никогда не одно и то же число.',
        meta: ReportExport.meta(filled.length),
        explanation:
          'Люди систематически недооценивают, сколько времени займёт задача, даже прекрасно помня, что прошлые похожие задачи тоже заняли больше запланированного. Термин ввели Дэниел Канеман и Амос Тверски в 1977–1979 годах; классический разбор — исследование Roger Buehler, Dale Griffin и Michael Ross (1994) о студентах и сроках дипломных работ.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear('planning-fallacy');
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
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
      <div class="wrap-wide" style=${gameAccentStyle('planning-fallacy')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
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
            <button class="primary" @click=${() => this.flow.advance(1)}>Вносить данные ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(0)}
        </section>

        <section class="${this.flow.roundClass(1)}" id="round-1">
          <div class="round-body">
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

          ${renderReveal({ value: r && r.avgRatio !== null ? `${r.avgRatio.toFixed(2)}×` : '—', ...REVEAL_COPY.planningFallacy(r && r.avgRatio !== null ? { avgRatio: r.avgRatio, accurateCount: r.accurateCount, overrunCount: r.overrunCount, total: r.filled.length } : null) })}

          <div class="group-compare">
            <div class="g low">
              <div class="t">Превышение меньше чем в 1.3 раза</div>
              <div class="v">${r ? `${r.accurateCount} из ${r.filled.length}` : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Превышение больше чем в 1.5 раза</div>
              <div class="v">${r ? `${r.overrunCount} из ${r.filled.length}` : '—'}</div>
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
                      return html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                        <td>${d.best} ч</td>
                        <td>${d.actual} ч</td>
                        <td>${planningRatio(d).toFixed(2)}×</td>
                      </tr>
                    `;
                    })
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
          </div>
          ${this.flow.lock(3)}
        </section>
          </div>

          <aside class="game-rail">
            <div class="game-rail-title">Ошибка планирования</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'planning-fallacy',
              stepLabels: ROUND_TITLES,
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-planning-fallacy', RetroGamePlanningFallacy);
