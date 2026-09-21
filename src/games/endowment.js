/* =========================================================
   GAME: Эффект владения (endowment)
   ONE role for the whole game — a group SELLS, the other group BUYS —
   but three lots of growing value and scale: a mug, a car, a house.
   Steps: roles → lot 1 → lot 2 → lot 3 (each: a description and a
   timer, everyone decides a price silently) → enter every price for
   all lots at once → results → context. Comparing the ratio across
   lots shows whether the effect grows or fades as the stakes rise.

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   first game with a group-split/click-to-swap screen (the group
   equivalent of ultimatum.js's pairing screen; see that file's header
   comment for why Roles.groupsHTML()/bindGroupSwap() aren't reused).
   Roles.makeGroups()/swapInGroups() (pure data, no DOM) are reused as
   -is. Keeps all original plain ids.
========================================================= */

import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { tipHtml } from '../charts/kit.js';
import { drawSwarm } from '../charts/swarm.js';
import CONTENT from '../content/endowment.json';
import { renderContext, renderFacts, renderNote, renderSteps } from '../content.js';
import { ChartController } from '../controllers/chart-controller.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { RoundTimers } from '../controllers/round-timers.js';
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
import { zeroBasedDomain } from '../logic/chart-data.js';
import {
  buildEndowmentEntries,
  loadableDraft,
  parseNumberInput,
  patchItem,
} from '../logic/entries.js';
import { escapeHtml, formatCompact } from '../logic/format.js';
import { endowmentReady, endowmentResults } from '../logic/results.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { Roles } from '../roles.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

// Three lots of growing value and scale. `hint` is a rough market reference so
// people price against something real instead of pulling numbers from air.
const LOTS = [
  {
    id: 'mug',
    name: 'Кружка',
    accusative: 'кружку',
    title: 'Лот 1 · Фирменная кружка',
    description:
      'Керамическая кружка с логотипом команды, 350 мл, ни разу не использованная. Обычная вещь — просто повод назвать цену.',
    hint: 'В магазинах такие кружки стоят примерно 400–800 ₽.',
  },
  {
    id: 'car',
    name: 'Автомобиль',
    accusative: 'автомобиль',
    title: 'Лот 2 · Автомобиль',
    description:
      'Пятилетний седан: пробег 80 000 км, один владелец, без аварий, свежее ТО. Вещь уже серьёзная — на ней экономят месяцами.',
    hint: 'Похожие объявления стоят примерно 1,2–1,6 млн ₽.',
  },
  {
    id: 'house',
    name: 'Дом',
    accusative: 'дом',
    title: 'Лот 3 · Дом за городом',
    description:
      'Дом 120 м² с участком в 8 соток, газ и вода, в 40 км от города. Самая крупная покупка в жизни большинства людей.',
    hint: 'Похожие объекты стоят примерно 8–12 млн ₽.',
  },
];
const LOT_TIMER_SECONDS = 60;
const FIRST_LOT_ROUND = 2;
const ENTRY_ROUND = FIRST_LOT_ROUND + LOTS.length; // 5
const RESULTS_ROUND = ENTRY_ROUND + 1; // 6
const CONTEXT_ROUND = RESULTS_ROUND + 1; // 7

const TOTAL_SCREENS = CONTEXT_ROUND + 1;
const ROUND_TITLES = [
  'Одна вещь, две роли — три масштаба',
  'Кто продаёт, кто покупает',
  ...LOTS.map((l) => l.title),
  'Впишите цены по всем лотам',
  'Что получилось у вашей команды',
  'Эффект владения',
];

export class RetroGameEndowment extends LitElement {
  static styles = sharedStyles;

  static properties = {
    groups: { state: true },
    entries: { state: true },
    draft: { state: true },
    results: { state: true },
    selectedSwapName: { state: true },
    shuffleSpin: { state: true },
  };

  constructor() {
    super();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.groups = Roles.makeGroups(state.participants);
    this.entries = buildEndowmentEntries(this.groups, LOTS.length);
    this.results = null;
    this.charts = new ChartController(this, [
      {
        id: 'end-chart',
        when: () => this.results,
        draw: (svg, theme) => this._drawChart(svg, theme),
      },
    ]);
    this.selectedSwapName = null;
    this.shuffleSpin = false;
    // One timer, live for one lot at a time; each lot keeps its own length.
    this.timers = new RoundTimers(this, { seconds: LOT_TIMER_SECONDS, count: LOTS.length });

    this.draft = loadableDraft(Persist.load('endowment'), {
      key: 'entries',
      length: state.participants.length,
      // drafts from the old two-round version had r1Price/r2Price, not prices[]
      rowCheck: (row) => Array.isArray(row.prices) && row.prices.length === LOTS.length,
    });
  }

  _restoreDraft() {
    this.flow.advance(ENTRY_ROUND, () => {
      this.groups = this.draft.payload.groups;
      this.entries = this.draft.payload.entries;
      this.draft = null;
    });
  }

  _discardDraft() {
    Persist.clear('endowment');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('endowment');
    renderHome();
  }

  _onShuffle() {
    this.groups = Roles.makeGroups(state.participants);
    this.selectedSwapName = null;
    this.shuffleSpin = true;
    setTimeout(() => {
      this.shuffleSpin = false;
    }, 350);
  }

  _onSwapClick(name) {
    if (this.selectedSwapName === null) {
      this.selectedSwapName = name;
      return;
    }
    if (this.selectedSwapName === name) {
      this.selectedSwapName = null;
      return;
    }
    Roles.swapInGroups(this.groups, this.selectedSwapName, name);
    this.selectedSwapName = null;
    this.groups = { ...this.groups };
  }

  _lockGroups() {
    this.flow.advance(FIRST_LOT_ROUND, () => {
      this.entries = buildEndowmentEntries(this.groups, LOTS.length);
    });
  }

  _nextFromLot(lot) {
    this.timers.reset();
    this.flow.advance(FIRST_LOT_ROUND + lot + 1);
  }

  // ---- entering prices ----

  _onPriceInput(e, idx, lot) {
    this.entries = patchItem(
      this.entries,
      idx,
      'prices',
      lot,
      parseNumberInput(e.target.value, { min: 0 }),
    );
    Persist.save('endowment', { groups: this.groups, entries: this.entries });
  }

  // How many people have priced every lot.
  _completeCount() {
    return this.entries.filter((e) => e.prices.every((p) => p !== null)).length;
  }

  // For each lot two lanes on the SAME price axis: what owners ask (their minimum) and
  // what buyers offer (their maximum). A mug and a house differ 10 000×, so every lot
  // has its own axis; the gap between the two clouds IS the endowment effect.
  _drawChart(svg, theme) {
    const lanes = [];
    LOTS.forEach((lot, i) => {
      const prices = (role) => this.entries.filter((e) => e.role === role && e.prices[i] !== null);
      const owners = prices('owner');
      const buyers = prices('buyer');
      const domain = zeroBasedDomain([...owners, ...buyers].map((e) => e.prices[i]));
      const stat = this.results.perLot[i];
      const lane = (label, color, list, avg, verb) => ({
        label,
        color,
        domain,
        format: formatCompact,
        refs:
          avg === null
            ? []
            : [
                {
                  value: avg,
                  label: `в среднем ${formatCompact(Math.round(avg))} ₽`,
                  color: theme.gold,
                },
              ],
        points: list.map((e) => ({
          id: e.name,
          value: e.prices[i],
          tip: tipHtml(escapeHtml(e.name), [
            [verb, `${e.prices[i].toLocaleString('ru-RU')} ₽`],
            ['Роль', e.role === 'owner' ? 'владелец' : 'покупатель'],
          ]),
        })),
      });
      lanes.push(
        lane(`${lot.name} · владельцы просят`, theme.accent, owners, stat.avgWTA, 'Просит'),
      );
      lanes.push(lane(`${lot.name} · покупатели дают`, theme.red, buyers, stat.avgWTP, 'Даёт'));
    });
    drawSwarm(svg, { lanes, theme });
  }

  _showResults() {
    this.results = endowmentResults(this.entries, LOTS.length);
    const { filled } = this.results;

    ReportExport.register(
      'endowment',
      {
        subtitle: 'Та же вещь внезапно дороже для того, кто ей уже владеет.',
        meta: ReportExport.meta(filled.length, '3 лота: кружка, автомобиль, дом'),
        explanation:
          'Одна и та же вещь субъективно ценнее для того, кто ею уже владеет, чем для того, кто хочет её купить, хотя рационально цена должна быть одной и той же. Знаменитый «эксперимент с кружками» описан в статье Kahneman, Knetsch, Thaler (1990) — эффект считается частным случаем неприятия потерь (loss aversion). Три лота разного масштаба показывают, как он ведёт себя, когда ставки растут.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.groups = Roles.makeGroups(state.participants);
    this.selectedSwapName = null;
    this.entries = buildEndowmentEntries(this.groups, LOTS.length);
    this.results = null;
    this.timers.resetAll();
    Persist.clear('endowment');
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  _groupsHolder() {
    const { groupA, groupB } = this.groups;
    const chip = (n) => html`
      <button
        type="button"
        class="role-chip ${this.selectedSwapName === n ? 'swap-selected' : ''}"
        @click=${() => this._onSwapClick(n)}
      >
        ${unsafeHTML(avatarName(n))}
      </button>
    `;
    return html`
      <div class="role-groups">
        <div class="role-group-col role-group-a">
          <div class="role-group-title">
            Владельцы — продают <span class="note" style="margin:0;">· ${groupA.length} чел.</span>
          </div>
          <div class="role-group-chips">${groupA.map(chip)}</div>
        </div>
        <div class="role-group-col role-group-b">
          <div class="role-group-title">
            Покупатели — покупают <span class="note" style="margin:0;">· ${groupB.length} чел.</span>
          </div>
          <div class="role-group-chips">${groupB.map(chip)}</div>
        </div>
      </div>
      <p class="note swap-hint">Нажмите на двух участников по очереди, чтобы поменять их местами.</p>
    `;
  }

  // One lot: a description, what each side is asked to do, and a timer.
  _lotRound(lot) {
    const item = LOTS[lot];
    const round = FIRST_LOT_ROUND + lot;
    const isLast = lot === LOTS.length - 1;
    const { groupA, groupB } = this.groups;
    const readonlyChip = (n) =>
      html`<span class="role-chip readonly">${unsafeHTML(avatarName(n))}</span>`;
    return html`
      <section class="${this.flow.roundClass(round)}" id="round-${round}">
        <div class="round-body">
          <p class="eyebrow">Лот ${lot + 1} из ${LOTS.length}</p>
          <h2>${item.title}</h2>
          <p class="lede">${item.description}</p>
          <p class="note">${item.hint}</p>

          <div class="group-compare lot-roles">
            <div class="g low team-a">
              <div class="t">Владельцы · продают</div>
              <p class="lot-role-text">
                Назовите <b>минимальную цену</b>, за которую вы продали бы ${item.accusative}.
              </p>
              <div class="role-group-chips">${groupA.map(readonlyChip)}</div>
            </div>
            <div class="g high team-b">
              <div class="t">Покупатели · покупают</div>
              <p class="lot-role-text">
                Назовите <b>максимальную цену</b>, которую вы заплатили бы за ${item.accusative}.
              </p>
              <div class="role-group-chips">${groupB.map(readonlyChip)}</div>
            </div>
          </div>

          <p class="note">
            Каждый решает молча и запоминает своё число (или записывает) — впишем все цены разом,
            когда пройдём три лота. Первое пришедшее в голову число — лучшее.
          </p>

          ${this.timers.card(lot, { runningLabel: 'на решение — каждый молча выбирает цену' })}

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(round - 1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" id="next-lot-${lot}" @click=${() => this._nextFromLot(lot)}>
              ${isLast ? 'Внести цены' : `Лот ${lot + 2} · ${LOTS[lot + 1].name.toLowerCase()}`} ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
        </div>
        ${this.flow.lock(round)}
      </section>
    `;
  }

  _entrySection(title, cls, role) {
    const rows = this.entries.map((e, idx) => ({ ...e, idx })).filter((e) => e.role === role);
    return html`
      <div class="team-entry-group ${cls}">
        <div class="team-entry-group-title">${title} <span class="count">· ${rows.length} чел.</span></div>
        <div class="entry-head three-col price-cols">
          <div>Участник</div>
          ${LOTS.map((l) => html`<div>${l.name}</div>`)}
        </div>
        ${rows.map(
          (e) => html`
            <div class="entry-row three-col price-cols">
              <div class="name">${unsafeHTML(avatarName(e.name))}</div>
              ${LOTS.map(
                (_, lot) => html`
                  <input
                    type="number"
                    min="0"
                    inputmode="numeric"
                    aria-label="${e.name}: цена, лот ${lot + 1}"
                    placeholder="₽"
                    data-lot=${lot}
                    .value=${e.prices[lot] ?? ''}
                    @input=${(ev) => this._onPriceInput(ev, e.idx, lot)}
                  />
                `,
              )}
            </div>
          `,
        )}
      </div>
    `;
  }

  render() {
    const complete = this._completeCount();
    const ready = endowmentReady(this.entries, LOTS.length);
    const r = this.results;

    return html`
      <div class="wrap-wide" style=${gameAccentStyle('endowment')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
          <p class="eyebrow">Командное упражнение · 12 минут</p>
          <h1>Одна вещь, две роли — три масштаба</h1>
          <p class="lede">
            Одна половина команды продаёт, другая покупает — и так все три лота: от кружки до
            дома. Роли не меняются.
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

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.flow.advance(1)}>Распределить группы ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(0)}
        </section>

        <section class="${this.flow.roundClass(1)}" id="round-1">
          <div class="round-body">
          <p class="eyebrow">Распределение ролей</p>
          <h2>Кто продаёт, кто покупает</h2>
          <p class="lede">Эти роли — на все три лота. Не нравится расклад — перемешайте.</p>

          <div>${this._groupsHolder()}</div>
          <button
            class="shuffle-btn ${this.shuffleSpin ? 'spin' : ''}"
            @click=${() => this._onShuffle()}
          >
            ${unsafeHTML(ICON_SHUFFLE)} Перемешать группы
          </button>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this._lockGroups()}>Лот 1 · кружка ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(1)}
        </section>

        ${LOTS.map((_, lot) => this._lotRound(lot))}

        <section class="${this.flow.roundClass(ENTRY_ROUND)}" id="round-${ENTRY_ROUND}">
          <div class="round-body">
          <p class="eyebrow">Сбор данных</p>
          <h2>Впишите цены по всем лотам</h2>
          <p class="lede">Владельцы вписывают цену продажи, покупатели — цену покупки. По одной цене на каждый лот.</p>

          <div id="entry-body">
            ${this._entrySection('Владельцы · продают', 'team-a', 'owner')}
            ${this._entrySection('Покупатели · покупают', 'team-b', 'buyer')}
          </div>

          <div class="fill-progress">
            Заполнено полностью: <span>${complete}</span> из <span>${this.entries.length}</span>
            <div class="track">
              <div style="width:${(complete / this.entries.length) * 100}%"></div>
            </div>
          </div>
          <p class="note">Чтобы сравнить цены, по каждому лоту нужна хотя бы одна цена продажи и одна цена покупки.</p>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(ENTRY_ROUND - 1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              id="next-btn"
              ?disabled=${!ready}
              @click=${() => this.flow.advance(RESULTS_ROUND, () => this._showResults())}
            >
              Показать результаты ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(ENTRY_ROUND)}
        </section>

        <section class="${this.flow.roundClass(RESULTS_ROUND)}" id="round-${RESULTS_ROUND}">
          <div class="round-body">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>

          ${renderReveal({
            value: r && r.ratio !== null ? `${r.ratio}×` : '—',
            ...REVEAL_COPY.endowment(
              r
                ? {
                    ratio: r.ratioN,
                    lots: r.perLot.map((l, i) => ({ name: LOTS[i].name, ratio: l.ratio })),
                  }
                : null,
            ),
          })}

          <div class="stat-row">
            ${
              r
                ? r.perLot.map(
                    (l, i) => html`
                    <div class="stat">
                      <div class="n">${l.ratio !== null ? `${l.ratio.toFixed(1)}×` : '—'}</div>
                      <div class="lab">${LOTS[i].name}: во столько раз владельцы просили больше</div>
                    </div>
                  `,
                  )
                : ''
            }
          </div>

          <div class="d3-chart-card">
            <div class="d3-chart-title">Что просят владельцы и что дают покупатели</div>
            <svg id="end-chart" class="d3-chart-svg" role="img" aria-label="Цены владельцев и покупателей по каждому из трёх лотов"></svg>
            <p class="d3-chart-cap">У каждого лота своя шкала цен. Чем правее «просят» относительно «дают» внутри одного лота, тем сильнее эффект владения.</p>
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Лот</th>
                <th>Владельцы просят</th>
                <th>Покупатели дают</th>
                <th>Разрыв</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.perLot.map(
                      (l, i) => html`
                      <tr>
                        <td class="name">${LOTS[i].name}</td>
                        <td>${l.avgWTA !== null ? `${Math.round(l.avgWTA).toLocaleString('ru-RU')} ₽` : '—'}</td>
                        <td>${l.avgWTP !== null ? `${Math.round(l.avgWTP).toLocaleString('ru-RU')} ₽` : '—'}</td>
                        <td>${l.ratio !== null ? `${l.ratio.toFixed(1)}×` : '—'}</td>
                      </tr>
                    `,
                    )
                  : ''
              }
            </tbody>
          </table>

          <table class="results-table" id="participants-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Роль</th>
                ${LOTS.map((l) => html`<th>${l.name}</th>`)}
              </tr>
            </thead>
            <tbody id="participants-tbody">
              ${
                r
                  ? r.filled.map(
                      (e) => html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(e.name))}</td>
                        <td>${e.role === 'owner' ? 'Владелец' : 'Покупатель'}</td>
                        ${e.prices.map((p) => html`<td>${p !== null ? `${p.toLocaleString('ru-RU')} ₽` : '—'}</td>`)}
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
            <button class="ghost" @click=${() => this.flow.scrollTo(ENTRY_ROUND)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.flow.advance(CONTEXT_ROUND)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(RESULTS_ROUND)}
        </section>

        <section class="${this.flow.roundClass(CONTEXT_ROUND)}" id="round-${CONTEXT_ROUND}">
          <div class="round-body">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Эффект владения</h1>
          ${renderContext(CONTENT.context)}

          <hr />
          <h2>Ещё немного фактов</h2>

          ${renderFacts(CONTENT.facts)}

          <div class="nav-row">
            <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
            <span></span>
          </div>
          </div>
          ${this.flow.lock(CONTEXT_ROUND)}
        </section>
          </div>

          <aside class="game-rail">
            <div class="game-rail-title">Эффект владения</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'endowment',
              stepLabels: ROUND_TITLES,
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-endowment', RetroGameEndowment);
