/* =========================================================
   GAME: Пивная игра (beer-game)
   MIT's beer distribution game, 24 weeks, played through private
   messages. Every week the app runs the chain up to the moment of
   ordering and writes each link its own summary (the Раздача block);
   the facilitator copies them into DMs, collects one number from each
   link and types the four orders in. The projector shows only the
   week and the team's running cost — never the demand, never anyone's
   warehouse. After the last week the players guess what customer
   demand was doing, then the truth (4 → 8, once) and the bullwhip.

   The chain state is replayed from the orders on every render
   (logic/beer-game.js simulate()), so the draft only keeps orders.
========================================================= */

import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { drawLines } from '../charts/lines.js';
import CONTENT from '../content/beer-game.json';
import { renderContext, renderFacts, renderNote, renderRules, renderSteps } from '../content.js';
import { ChartController } from '../controllers/chart-controller.js';
import { ProjectorController } from '../controllers/projector-controller.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { renderDispatch } from '../dispatch.js';
import { confirmExit, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import {
  ICON_CLIPBOARD,
  ICON_DOWNLOAD,
  ICON_LEFT,
  ICON_RIGHT,
  ICON_SHUFFLE,
  ICON_X,
} from '../icons.js';
import {
  BG_BACKLOG,
  BG_BENCHMARK_COST,
  BG_BREW_DELAY,
  BG_DEMAND_AFTER,
  BG_DEMAND_BEFORE,
  BG_HOLDING,
  BG_ORDER_DELAY,
  BG_ROLES,
  BG_SHIP_DELAY,
  BG_STEP_WEEK,
  BG_STOCK,
  BG_WEEKS,
  beerResults,
  bgDemand,
  bgMessage,
  bgTotal,
  simulate,
} from '../logic/beer-game.js';
import { parseNumberInput } from '../logic/entries.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { Roles } from '../roles.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const GAME_ID = 'beer-game';
const SCREEN = { intro: 0, roles: 1, weeks: 2, forecast: 3, truth: 4, results: 5, context: 6 };
const TOTAL_SCREENS = 7;
const ROUND_TITLES = [
  'Пивная игра — правила',
  'Кто за какое звено',
  'Недели',
  'Каким был спрос?',
  'Вот каким он был на самом деле',
  'Что получилось у вашей цепочки',
  'Пивная игра',
];
const SHAPES = [
  { id: 'flat', label: 'ровный' },
  { id: 'step', label: 'один скачок' },
  { id: 'waves', label: 'волнами' },
  { id: 'upDown', label: 'рос, потом падал' },
];
const HOST = '(ведущий)';
// one clearly different colour per link (the game's own accent is too close to gold for four lines)
const LINK_COLORS = (theme) => ['var(--blue)', theme.red, theme.gold, 'var(--purple-on-light2)'];
const fmt = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const VARS = {
  holding: fmt(BG_HOLDING),
  backlog: BG_BACKLOG,
  orderDelay: BG_ORDER_DELAY,
  shipDelay: BG_SHIP_DELAY,
  brewDelay: BG_BREW_DELAY,
  stock: BG_STOCK,
  demand0: BG_DEMAND_BEFORE,
  demand1: BG_DEMAND_AFTER,
};
const FORECAST_TEXT =
  'Пивная игра окончена. Два вопроса, ответьте мне:\n1) Как, по-вашему, менялся спрос покупателей: ровный / один скачок / волнами / рос, потом падал?\n2) Какой был максимальный спрос покупателей за неделю? (число)';

export class RetroGameBeerGame extends LitElement {
  static styles = sharedStyles;

  static properties = {
    members: { state: true },
    orders: { state: true },
    pending: { state: true },
    forecasts: { state: true },
    sent: { state: true },
    draft: { state: true },
    results: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.members = this._assign();
    this.orders = [];
    this.pending = [null, null, null, null];
    this.forecasts = this._blankForecasts();
    this.sent = new Set();
    this.results = null;
    this.charts = new ChartController(this, [
      {
        id: 'bg-truth',
        when: () => this.flow.screenIdx >= SCREEN.truth,
        draw: (svg, theme) => this._drawTruth(svg, theme),
      },
      {
        id: 'bg-orders',
        when: () => this.results,
        draw: (svg, theme) => this._drawOrders(svg, theme),
      },
      {
        id: 'bg-stock',
        when: () => this.results,
        draw: (svg, theme) => this._drawStock(svg, theme),
      },
    ]);
    this.projector = new ProjectorController(this, GAME_ID, {
      roster: (screen) => this._projectorRoster(screen),
    });
    this.draft = loadDraft(Persist.load(GAME_ID), this.names.length);
  }

  // Names dealt round-robin over the four links, the shop first.
  _assign() {
    const members = BG_ROLES.map(() => []);
    Roles.shuffle(this.names).forEach((n, i) => {
      members[i % 4].push(n);
    });
    return members;
  }

  _blankForecasts() {
    return this.members
      .slice(1)
      .flat()
      .map((name) => ({ name, shape: null, peak: null }));
  }

  _save() {
    Persist.save(GAME_ID, {
      members: this.members,
      orders: this.orders,
      forecasts: this.forecasts,
    });
  }

  _restoreDraft() {
    this.flow.advance(SCREEN.roles, () => {
      const p = this.draft.payload;
      this.members = p.members;
      this.orders = p.orders;
      this.forecasts = p.forecasts ?? this._blankForecasts();
      this.draft = null;
    });
  }

  _discardDraft() {
    Persist.clear(GAME_ID);
    this.draft = null;
  }

  _goHome() {
    Persist.clear(GAME_ID);
    renderHome();
  }

  _reshuffle() {
    this.members = this._assign();
    this.forecasts = this._blankForecasts();
    this._save();
  }

  _setPending(i, raw) {
    const next = this.pending.slice();
    const v = parseNumberInput(raw, { min: 0, max: 999 });
    next[i] = v === null ? null : Math.round(v);
    this.pending = next;
  }

  _nextWeek() {
    this.orders = [...this.orders, this.pending.slice()];
    this.pending = [null, null, null, null];
    this.sent = new Set();
    this._save();
  }

  _undoWeek() {
    if (!this.orders.length) return;
    this.pending = this.orders.at(-1).slice();
    this.orders = this.orders.slice(0, -1);
    this.sent = new Set();
    this._save();
  }

  _setForecast(idx, patch) {
    const next = this.forecasts.slice();
    next[idx] = { ...next[idx], ...patch };
    this.forecasts = next;
    this._save();
  }

  _projectorRoster(screen) {
    if (screen !== SCREEN.roles) return null;
    return {
      kind: 'groups',
      title: 'Кто за какое звено',
      groups: BG_ROLES.map((r, i) => ({
        label: r.name,
        tone: i % 2 ? 'b' : 'a',
        names: this.members[i],
      })),
    };
  }

  _drawTruth(svg, theme) {
    const weeks = Math.max(this.orders.length, 1);
    drawLines(svg, {
      xLabels: Array.from({ length: weeks }, (_, i) => `${i + 1}`),
      series: [
        {
          label: 'Спрос покупателей',
          color: theme.accentDeep,
          values: Array.from({ length: weeks }, (_, i) => bgDemand(i + 1)),
        },
      ],
      yDomain: [0, 12],
      xTitle: 'неделя',
      theme,
    });
  }

  _drawOrders(svg, theme) {
    const r = this.results;
    const colors = LINK_COLORS(theme);
    drawLines(svg, {
      xLabels: r.demand.map((_, i) => `${i + 1}`),
      series: [
        {
          label: 'Покупатели',
          color: 'var(--ink-faint)',
          values: r.demand,
          dash: true,
          dots: false,
        },
        ...BG_ROLES.map((role, i) => ({
          label: role.name,
          color: colors[i],
          values: r.ordersByRole[i],
          dots: false,
        })),
      ],
      xTitle: 'неделя',
      theme,
    });
  }

  _drawStock(svg, theme) {
    const r = this.results;
    const colors = LINK_COLORS(theme);
    const all = r.netStock.flat();
    drawLines(svg, {
      xLabels: r.demand.map((_, i) => `${i + 1}`),
      series: BG_ROLES.map((role, i) => ({
        label: role.name,
        color: colors[i],
        values: r.netStock[i],
        dots: false,
      })),
      refs: [{ value: 0, label: 'ниже нуля — долг', color: 'var(--ink-faint)' }],
      yDomain: [Math.min(0, ...all), Math.max(BG_STOCK, ...all)],
      xTitle: 'неделя',
      theme,
    });
  }

  _showResults() {
    this.results = beerResults(this.orders, this.forecasts);
    ReportExport.register(
      GAME_ID,
      {
        subtitle:
          'Спрос изменился один раз, а цепочку поставок трясло несколько недель. И никто не виноват.',
        meta: ReportExport.meta(this.names.length, `${this.orders.length} недель`),
        explanation:
          'Пивная игра MIT (Forrester, Sterman 1989): спрос покупателей вырос один раз, с 4 до 8, но из-за задержек и того, что каждое звено видит только свой кусок, заказы вверх по цепочке раскачиваются всё сильнее — эффект хлыста. Эталон — затраты той же цепочки, если бы каждое звено играло по простому правилу, помнящему о заказах в пути.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.members = this._assign();
    this.orders = [];
    this.pending = [null, null, null, null];
    this.forecasts = this._blankForecasts();
    this.sent = new Set();
    this.results = null;
    Persist.clear(GAME_ID);
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  _section(idx, body) {
    return html`
      <section class="${this.flow.roundClass(idx)}" id="round-${idx}">
        <div class="round-body">${body}</div>
        ${this.flow.lock(idx)}
      </section>
    `;
  }

  _nav(idx, { next, label, disabled = false, action } = {}) {
    return html`
      <div class="nav-row">
        ${idx > 0 ? html`<button class="ghost" @click=${() => this.flow.scrollTo(idx - 1)}>${unsafeHTML(ICON_LEFT)} Назад</button>` : html`<span></span>`}
        <button class="primary" data-testid="next-btn-${idx}" ?disabled=${disabled} @click=${() => this.flow.advance(next, action)}>
          ${label} ${unsafeHTML(ICON_RIGHT)}
        </button>
      </div>
    `;
  }

  _weeksSection() {
    const sim = simulate(this.orders);
    const over = this.orders.length >= BG_WEEKS;
    const week = over ? BG_WEEKS : sim.week;
    const cost = bgTotal(sim.cost);
    const rows = over
      ? []
      : BG_ROLES.flatMap((role, i) =>
          (this.members[i].length ? this.members[i] : [HOST]).map((name) => ({
            name,
            tag: role.name,
            text: bgMessage(sim.week, i, sim.views[i]),
          })),
        );
    return html`
      <p class="eyebrow" data-projector="eyebrow" data-projector-text="Неделя ${week}">Неделя ${week} из ${BG_WEEKS} · игрокам число недель не называйте</p>
      <h2 data-projector="title">${over ? 'Игра окончена' : `Неделя ${week}: сколько заказываем?`}</h2>
      <div class="board" data-projector="body">
        <div class="board-row">
          <div class="board-cell">
            <div class="n">${fmt(cost)}</div>
            <div class="lab">затраты всей цепочки на сейчас</div>
          </div>
        </div>
      </div>
      ${
        over
          ? html`<p class="lede">Все ${BG_WEEKS} недель сыграны. Объявите остановку и переходите к вопросам про спрос.</p>`
          : html`
            ${renderDispatch({
              title: `Раздача · неделя ${week}`,
              hint: 'Отправьте каждому звену его сводку. Ответ — одно число: сколько заказать.',
              rows,
              sent: this.sent,
              onSent: (name) => {
                this.sent = new Set(this.sent).add(name);
              },
            })}
            <h3>Заказы недели ${week}</h3>
            <div class="entry-head three-col" style="grid-template-columns: repeat(4, minmax(0, 1fr))">
              ${BG_ROLES.map((r) => html`<div>${r.name}</div>`)}
            </div>
            <div class="entry-row" style="grid-template-columns: repeat(4, minmax(0, 1fr))" data-testid="orders-row">
              ${BG_ROLES.map(
                (r, i) => html`<input
                  type="number"
                  min="0"
                  inputmode="numeric"
                  aria-label="${r.name}: заказ на неделе ${week}"
                  placeholder="заказ"
                  .value=${this.pending[i] ?? ''}
                  @input=${(e) => this._setPending(i, e.target.value)}
                />`,
              )}
            </div>
          `
      }
      <div class="nav-row">
        <button class="ghost" @click=${() => this.flow.scrollTo(SCREEN.roles)}>${unsafeHTML(ICON_LEFT)} Назад</button>
        <button class="ghost" ?disabled=${!this.orders.length} @click=${() => this._undoWeek()}>Отменить прошлую неделю</button>
        ${
          over
            ? html`<button class="primary" data-testid="next-btn-${SCREEN.weeks}" @click=${() => this.flow.advance(SCREEN.forecast)}>
                Вопросы про спрос ${unsafeHTML(ICON_RIGHT)}
              </button>`
            : html`<button
                class="primary"
                data-testid="week-btn"
                ?disabled=${this.pending.some((p) => p === null)}
                @click=${() => this._nextWeek()}
              >
                ${week === BG_WEEKS ? 'Завершить игру' : 'Следующая неделя'} ${unsafeHTML(ICON_RIGHT)}
              </button>`
        }
      </div>
    `;
  }

  render() {
    const r = this.results;
    const forecastRows = this.forecasts.map((f) => ({
      name: f.name,
      tag: 'прогноз спроса',
      text: FORECAST_TEXT,
    }));
    return html`
      <div class="wrap-wide" style=${gameAccentStyle(GAME_ID)}>
        <retro-projector-button></retro-projector-button>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
            ${this._section(
              SCREEN.intro,
              html`
                <p class="eyebrow" data-projector="eyebrow">Командное упражнение · 40 минут</p>
                <h1 data-projector="title">Пивная игра</h1>
                <p class="lede">Цепочка поставок из четырёх звеньев. Каждый видит только свой склад.</p>
                ${renderRules(CONTENT.rules, VARS)}

                <div class="draft-mount">
                  ${
                    this.draft
                      ? html`
                        <div class="draft-banner">
                          <span class="draft-text">${unsafeHTML(ICON_CLIPBOARD)} Есть незавершённая попытка (${timeAgo(this.draft.savedAt)}) — продолжить с того места?</span>
                          <span class="draft-actions">
                            <button type="button" class="draft-restore" @click=${() => this._restoreDraft()}>Восстановить</button>
                            <button type="button" class="draft-discard" @click=${() => this._discardDraft()}>Начать заново</button>
                          </span>
                        </div>
                      `
                      : ''
                  }
                </div>
                ${renderSteps(CONTENT.intro.steps, VARS)}
                ${renderNote(CONTENT.intro.note)}
                ${this._nav(SCREEN.intro, { next: SCREEN.roles, label: 'Распределить звенья' })}
              `,
            )}

            ${this._section(
              SCREEN.roles,
              html`
                <p class="eyebrow" data-projector="eyebrow">Роли</p>
                <h2 data-projector="title">Кто за какое звено</h2>
                <p class="lede">Магазин → Оптовик → Дистрибьютор → Пивоварня. Покупатели приходят только в Магазин.</p>
                <div class="role-groups">
                  ${BG_ROLES.map(
                    (role, i) => html`
                      <div class="role-group-col ${i % 2 ? 'role-group-b' : 'role-group-a'}">
                        <div class="role-group-title">${role.name}</div>
                        <div class="role-group-chips">
                          ${
                            this.members[i].length
                              ? this.members[i].map(
                                  (n) =>
                                    html`<span class="role-chip readonly">${unsafeHTML(avatarName(n))}</span>`,
                                )
                              : html`<span class="mini-note">играет ведущий</span>`
                          }
                        </div>
                      </div>
                    `,
                  )}
                </div>
                <div class="nav-row">
                  <button class="ghost" @click=${() => this.flow.scrollTo(SCREEN.intro)}>${unsafeHTML(ICON_LEFT)} Назад</button>
                  <button class="ghost" ?disabled=${this.orders.length > 0} @click=${() => this._reshuffle()}>${unsafeHTML(ICON_SHUFFLE)} Перемешать</button>
                  <button class="primary" data-testid="next-btn-${SCREEN.roles}" @click=${() => this.flow.advance(SCREEN.weeks, () => this._save())}>
                    Неделя 1 ${unsafeHTML(ICON_RIGHT)}
                  </button>
                </div>
              `,
            )}

            ${this._section(SCREEN.weeks, this._weeksSection())}

            ${this._section(
              SCREEN.forecast,
              html`
                <p class="eyebrow" data-projector="eyebrow">Перед раскрытием</p>
                <h2 data-projector="title">Как, по-вашему, менялся спрос покупателей?</h2>
                <p class="lede">Отвечают все, кроме Магазина: Магазин и так знает ответ.</p>
                ${renderDispatch({
                  title: 'Раздача · вопросы про спрос',
                  rows: forecastRows,
                  sent: this.sent,
                  onSent: (name) => {
                    this.sent = new Set(this.sent).add(name);
                  },
                })}
                <div class="entry-head number-choice"><div>Участник</div><div>Максимум</div><div>Форма спроса</div></div>
                ${this.forecasts.map(
                  (f, i) => html`
                    <div class="entry-row number-choice">
                      <div class="name">${unsafeHTML(avatarName(f.name))}</div>
                      <input
                        type="number"
                        min="0"
                        inputmode="numeric"
                        aria-label="${f.name}: максимальный спрос"
                        placeholder="число"
                        .value=${f.peak ?? ''}
                        @input=${(e) => this._setForecast(i, { peak: parseNumberInput(e.target.value, { min: 0, max: 999 }) })}
                      />
                      <div class="toggle-pair multi">
                        ${SHAPES.map(
                          (s) =>
                            html`<button type="button" class=${f.shape === s.id ? 'on' : ''} @click=${() => this._setForecast(i, { shape: f.shape === s.id ? null : s.id })}>${s.label}</button>`,
                        )}
                      </div>
                    </div>
                  `,
                )}
                ${this._nav(SCREEN.forecast, { next: SCREEN.truth, label: 'Показать настоящий спрос' })}
              `,
            )}

            ${this._section(
              SCREEN.truth,
              html`
                <p class="eyebrow" data-projector="eyebrow">Раскрытие</p>
                <h2 data-projector="title">Спрос изменился ровно один раз</h2>
                <p class="lede" data-projector="lede">
                  ${BG_DEMAND_BEFORE} ящика в неделю первые ${BG_STEP_WEEK - 1} недели, потом ${BG_DEMAND_AFTER} — и так до конца. Больше ничего.
                </p>
                <div class="d3-chart-card" data-projector="chart">
                  <div class="d3-chart-title">Спрос покупателей по неделям</div>
                  <svg id="bg-truth" class="d3-chart-svg" role="img" aria-label="Спрос покупателей: 4 ящика до пятой недели, потом 8"></svg>
                </div>
                ${this._nav(SCREEN.truth, { next: SCREEN.results, label: 'Что получилось у цепочки', action: () => this._showResults() })}
              `,
            )}

            ${this._section(
              SCREEN.results,
              html`
                <p class="eyebrow" data-projector="eyebrow">Результаты</p>
                <h2 data-projector="title">Что получилось у вашей цепочки</h2>
                ${renderReveal({ value: r ? `×${fmt(r.ratio)}` : '—', ...REVEAL_COPY.beerGame(r) })}
                <div class="d3-chart-card" data-projector="chart">
                  <div class="d3-chart-title">Заказы звеньев — эффект хлыста</div>
                  <svg id="bg-orders" class="d3-chart-svg" role="img" aria-label="Заказы каждого звена по неделям и спрос покупателей"></svg>
                  <p class="d3-chart-cap">Пунктир — спрос покупателей. Чем дальше звено от покупателя, тем сильнее раскачиваются его заказы.</p>
                </div>
                <div class="d3-chart-card" data-projector="chart">
                  <div class="d3-chart-title">Склад минус долг</div>
                  <svg id="bg-stock" class="d3-chart-svg" role="img" aria-label="Склад за вычетом долга у каждого звена по неделям"></svg>
                  <p class="d3-chart-cap">Сначала дефицит и долги, потом склады, забитые пивом, которое никому не нужно.</p>
                </div>
                <table class="results-table">
                  <thead><tr><th>Звено</th><th>Кто играл</th><th>Макс. заказ</th><th>Затраты</th></tr></thead>
                  <tbody>
                    ${
                      r
                        ? BG_ROLES.map(
                            (role, i) => html`
                              <tr>
                                <td><b>${role.name}</b></td>
                                <td>${this.members[i].length ? unsafeHTML(this.members[i].map((n) => avatarName(n)).join(' ')) : HOST}</td>
                                <td>${r.maxOrderByRole[i]}</td>
                                <td>${fmt(r.costByRole[i])}</td>
                              </tr>
                            `,
                          )
                        : ''
                    }
                    ${r ? html`<tr><td><b>Вся цепочка</b></td><td></td><td></td><td><b>${fmt(r.teamCost)}</b> (эталон ${fmt(BG_BENCHMARK_COST)})</td></tr>` : ''}
                  </tbody>
                </table>
                <div class="export-row">
                  <button class="ghost" id="export-btn" @click=${(e) => ReportExport.download(e.currentTarget)}>
                    ${unsafeHTML(ICON_DOWNLOAD)} Сохранить результаты
                  </button>
                </div>
                ${this._nav(SCREEN.results, { next: SCREEN.context, label: 'Что это было?' })}
              `,
            )}

            ${this._section(
              SCREEN.context,
              html`
                <p class="eyebrow" data-projector="eyebrow">А теперь — контекст</p>
                <h1 data-projector="title">Пивная игра</h1>
                ${renderContext(CONTENT.context, {
                  ...VARS,
                  maxBrewOrder: r?.maxOrderByRole[3] ?? '—',
                  teamCost: r ? fmt(r.teamCost) : '—',
                  benchmarkCost: fmt(BG_BENCHMARK_COST),
                  wavesShare: r?.wavesShare ?? '—',
                })}
                <hr />
                <h2>Ещё немного фактов</h2>
                ${renderFacts(CONTENT.facts)}
                <div class="nav-row">
                  <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
                  <span></span>
                </div>
              `,
            )}
          </div>

          <aside class="game-rail">
            <div class="game-rail-title">Пивная игра</div>
            ${renderTrail({ current: this.flow.activeRound, total: TOTAL_SCREENS, gameId: GAME_ID, stepLabels: ROUND_TITLES })}
          </aside>
        </div>
      </div>
    `;
  }
}

// A saved chain is offered back only if it was set up for the same team size.
function loadDraft(loaded, people) {
  const p = loaded?.payload;
  if (!Array.isArray(p?.members) || !Array.isArray(p.orders)) return null;
  return p.members.flat().length === people ? loaded : null;
}

customElements.define('retro-game-beer-game', RetroGameBeerGame);
