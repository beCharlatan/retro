/* =========================================================
   GAME: Рынок «лимонов» (lemons)
   Akerlof's market for lemons, four rounds. Half the team sells used
   cars, half buys. Each round every seller privately learns (from the
   Раздача block — a message the facilitator copies into a DM) whether
   their car is good or a lemon, and names a price. The projector shows
   the showcase — lot numbers and prices only — and buyers pick one by
   one in a random order. Then the quality of what was bought is
   revealed. Round 4 adds an honest inspection a seller can pay for.

   Everything random (roles, qualities, lot numbers, buying order) is
   drawn when the roles are set and kept in the draft, so a restored
   game replays the same market.
========================================================= */

import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { drawLines } from '../charts/lines.js';
import CONTENT from '../content/lemons.json';
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
import { renderLeaderboard } from '../leaderboard.js';
import { parseNumberInput } from '../logic/entries.js';
import { formatSigned } from '../logic/format.js';
import { rankScores } from '../logic/leaderboard.js';
import {
  drawRounds,
  LM_CERT_COST,
  LM_CERT_ROUND,
  LM_MAX_PRICE,
  LM_ROUNDS,
  LM_VALUES,
  lemonsMessage,
  lemonsResults,
  nextBuyer,
  onShowcase,
  roundStats,
  splitMarket,
} from '../logic/lemons.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const GAME_ID = 'lemons';
const ROLES = 1;
const FIRST_ROUND = 2;
const RESULTS = FIRST_ROUND + LM_ROUNDS;
const CONTEXT = RESULTS + 1;
const TOTAL_SCREENS = CONTEXT + 1;
const ROUND_TITLES = [
  'Рынок «лимонов» — правила',
  'Кто продаёт, кто покупает',
  ...Array.from({ length: LM_ROUNDS }, (_, i) =>
    i + 1 === LM_CERT_ROUND ? `Раунд ${i + 1}: появилась проверка` : `Раунд ${i + 1}`,
  ),
  'Что получилось на вашем рынке',
  'Рынок «лимонов»',
];
const VARS = {
  goodSeller: LM_VALUES.good.seller,
  goodBuyer: LM_VALUES.good.buyer,
  lemonSeller: LM_VALUES.lemon.seller,
  lemonBuyer: LM_VALUES.lemon.buyer,
  rounds: LM_ROUNDS,
  certCost: LM_CERT_COST,
};

export class RetroGameLemons extends LitElement {
  static styles = sharedStyles;

  static properties = {
    market: { state: true },
    rounds: { state: true },
    sent: { state: true },
    draft: { state: true },
    results: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this._newMarket();
    this.results = null;
    this.charts = new ChartController(this, [
      {
        id: 'lm-chart',
        when: () => this.results,
        draw: (svg, theme) => this._drawChart(svg, theme),
      },
    ]);
    this.projector = new ProjectorController(this, GAME_ID, {
      roster: (screen) => this._projectorRoster(screen),
    });
    this.draft = loadDraft(Persist.load(GAME_ID), this.names.length);
  }

  _newMarket() {
    this.market = splitMarket(this.names);
    this.rounds = drawRounds(this.market);
    this.sent = Array.from({ length: LM_ROUNDS }, () => new Set());
  }

  _save() {
    Persist.save(GAME_ID, {
      market: this.market,
      rounds: this.rounds,
      sent: this.sent.map((s) => [...s]),
    });
  }

  _restoreDraft() {
    this.flow.advance(ROLES, () => {
      const p = this.draft.payload;
      this.market = p.market;
      this.rounds = p.rounds;
      this.sent = (p.sent ?? []).map((s) => new Set(s));
      while (this.sent.length < LM_ROUNDS) this.sent.push(new Set());
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
    this._newMarket();
    this._save();
  }

  _patchRound(ri, fn) {
    const rounds = this.rounds.slice();
    rounds[ri] = fn(structuredClone(rounds[ri]));
    this.rounds = rounds;
    this._save();
  }

  _patchLot(ri, seller, patch) {
    this._patchRound(ri, (r) => {
      const lot = r.lots.find((l) => l.seller === seller);
      Object.assign(lot, patch);
      return r;
    });
  }

  _pick(ri, buyer, lotNo) {
    this._patchRound(ri, (r) => {
      r.picks[buyer] = lotNo;
      if (lotNo !== 'pass') r.lots.find((l) => l.lot === lotNo).buyer = buyer;
      return r;
    });
  }

  _undoPick(ri) {
    this._patchRound(ri, (r) => {
      const last = [...r.order].reverse().find((b) => b in r.picks);
      if (!last) return r;
      const lotNo = r.picks[last];
      delete r.picks[last];
      if (lotNo !== 'pass') r.lots.find((l) => l.lot === lotNo).buyer = null;
      return r;
    });
  }

  _markSent(ri, name) {
    const sent = this.sent.slice();
    sent[ri] = new Set(sent[ri]).add(name);
    this.sent = sent;
    this._save();
  }

  _projectorRoster(screen) {
    if (screen < ROLES || screen >= RESULTS) return null;
    return {
      kind: 'groups',
      title: 'Кто продаёт, кто покупает',
      groups: [
        { label: 'Продавцы', tone: 'a', names: this.market.sellers },
        { label: 'Покупатели', tone: 'b', names: this.market.buyers },
      ],
    };
  }

  _drawChart(svg, theme) {
    const r = this.results;
    drawLines(svg, {
      xLabels: Array.from({ length: LM_ROUNDS }, (_, i) =>
        i + 1 === LM_CERT_ROUND ? `Раунд ${i + 1} (проверка)` : `Раунд ${i + 1}`,
      ),
      series: [
        { label: 'Хороших среди проданных', color: theme.accentDeep, values: r.goodSoldByRound },
        {
          label: 'Хороших среди выставленных',
          color: theme.gold,
          values: r.goodListedByRound,
          dash: true,
        },
      ],
      yDomain: [0, 100],
      format: (v) => `${v}%`,
      theme,
    });
  }

  _showResults() {
    this.results = lemonsResults(this.rounds, this.market);
    ReportExport.register(
      GAME_ID,
      {
        subtitle: 'Когда покупатель не может отличить хорошее от плохого, хорошее уходит с рынка.',
        meta: ReportExport.meta(
          this.names.length,
          `${this.market.sellers.length} продавцов · ${LM_ROUNDS} раунда`,
        ),
        explanation:
          'Рынок «лимонов» (Akerlof, 1970): покупатель, не видящий качества, платит среднюю цену, её не хватает владельцу хорошей машины, и хорошие машины уходят с рынка. Независимая проверка (гарантия, репутация, отзывы) возвращает их. За эту работу Акерлоф получил Нобелевскую премию 2001 года.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this._newMarket();
    this.results = null;
    Persist.clear(GAME_ID);
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  _badge(lot) {
    if (!lot.cert) return '';
    return html`<span class="lot-badge">✔ Проверено: ${LM_VALUES[lot.quality].label}</span>`;
  }

  // Projected: lot numbers and prices; the quality only after the reveal.
  _showcase(ri) {
    const round = this.rounds[ri];
    const lots = round.lots.filter(onShowcase).sort((a, b) => a.price - b.price || a.lot - b.lot);
    return html`
      <div data-projector="body">
        ${
          lots.length
            ? html`<div class="lots">
                ${lots.map(
                  (l) => html`
                    <div class="lot ${l.buyer ? 'sold' : ''} ${round.revealed ? l.quality : ''}">
                      <div class="lot-no">Лот ${l.lot}</div>
                      <div class="lot-price">${l.price}</div>
                      ${this._badge(l)}
                      <div class="lot-status">
                        ${l.buyer ? `купил(а): ${l.buyer}` : 'на витрине'}
                        ${round.revealed ? html`<br /><b>${LM_VALUES[l.quality].label}</b>` : ''}
                      </div>
                    </div>
                  `,
                )}
              </div>`
            : html`<p class="mini-note">Пока ни одной машины на витрине.</p>`
        }
      </div>
    `;
  }

  _priceRow(ri, lot) {
    const certRound = ri + 1 === LM_CERT_ROUND;
    return html`
      <div class="entry-row number-choice">
        <div class="name">${unsafeHTML(avatarName(lot.seller))} <span class="mini-note">· лот ${lot.lot} · ${LM_VALUES[lot.quality].label}</span></div>
        <input
          type="number"
          min="0"
          max=${LM_MAX_PRICE}
          inputmode="numeric"
          aria-label="${lot.seller}: цена"
          placeholder="цена"
          ?disabled=${!lot.selling || this.rounds[ri].revealed}
          .value=${lot.price ?? ''}
          @input=${(e) =>
            this._patchLot(ri, lot.seller, {
              price: parseNumberInput(e.target.value, { min: 0, max: LM_MAX_PRICE }),
            })}
        />
        <div class="toggle-pair multi">
          <button type="button" class=${lot.selling ? '' : 'on'} @click=${() => this._patchLot(ri, lot.seller, { selling: !lot.selling })}>
            Не продаю
          </button>
          ${
            certRound
              ? html`<button type="button" class=${lot.cert ? 'on' : ''} @click=${() => this._patchLot(ri, lot.seller, { cert: !lot.cert })}>
                  Проверка −${LM_CERT_COST}
                </button>`
              : ''
          }
        </div>
      </div>
    `;
  }

  _buyerPanel(ri) {
    const round = this.rounds[ri];
    const buyer = nextBuyer(round);
    const free = round.lots
      .filter((l) => onShowcase(l) && !l.buyer)
      .sort((a, b) => a.price - b.price);
    return html`
      <div class="round-recap">
        <div class="round-recap-title">Покупки</div>
        <p class="mini-note">Очередь покупателей: ${round.order.join(' → ')}</p>
        ${
          buyer && !round.revealed
            ? html`
              <p>Выбирает ${unsafeHTML(avatarName(buyer))}:</p>
              <div class="bid-buttons">
                ${free.map((l) => html`<button type="button" class="ghost" @click=${() => this._pick(ri, buyer, l.lot)}>Лот ${l.lot} · ${l.price}</button>`)}
                <button type="button" class="ghost" @click=${() => this._pick(ri, buyer, 'pass')}>Пас</button>
              </div>
            `
            : html`<p class="mini-note">${round.revealed ? 'Раунд завершён.' : 'Все покупатели сделали выбор.'}</p>`
        }
        <p class="mini-note">
          ${round.order
            .filter((b) => b in round.picks)
            .map((b) => `${b}: ${round.picks[b] === 'pass' ? 'пас' : `лот ${round.picks[b]}`}`)
            .join(' · ')}
        </p>
        ${
          !round.revealed && Object.keys(round.picks).length
            ? html`<button type="button" class="ghost" @click=${() => this._undoPick(ri)}>Отменить последний выбор</button>`
            : ''
        }
      </div>
    `;
  }

  _recap(ri) {
    const s = roundStats(this.rounds[ri]);
    return html`
      <div class="round-recap" data-projector="body">
        <div class="round-recap-title">Как прошёл раунд ${ri + 1}</div>
        <div class="round-recap-stats">
          <div class="round-recap-stat">
            <div class="n">${s.sold} из ${s.listed}</div>
            <div class="lab">машин продано из выставленных</div>
          </div>
          <div class="round-recap-stat">
            <div class="n">${s.goodSold} из ${s.sold}</div>
            <div class="lab">проданных были хорошими</div>
          </div>
          <div class="round-recap-stat">
            <div class="n">${s.avgPrice ?? '—'}</div>
            <div class="lab">средняя цена сделки</div>
          </div>
        </div>
      </div>
    `;
  }

  _roundSection(ri) {
    const screen = FIRST_ROUND + ri;
    const round = this.rounds[ri];
    const certRound = ri + 1 === LM_CERT_ROUND;
    const pricesIn = round.lots.every((l) => !l.selling || l.price !== null);
    const allPicked =
      nextBuyer(round) === null || round.lots.every((l) => !onShowcase(l) || l.buyer);
    const last = ri === LM_ROUNDS - 1;
    const dispatchRows = [
      ...round.lots.map((l) => ({
        name: l.seller,
        tag: `Продавец · лот ${l.lot}`,
        text: lemonsMessage(ri, l),
      })),
      ...this.market.buyers.map((b) => ({ name: b, tag: 'Покупатель', text: null })),
    ];
    return html`
      <section class="${this.flow.roundClass(screen)}" id="round-${screen}">
        <div class="round-body">
          <p class="eyebrow" data-projector="eyebrow">Раунд ${ri + 1} из ${LM_ROUNDS}</p>
          <h2 data-projector="title">${certRound ? CONTENT.announcement.title : 'Витрина подержанных машин'}</h2>
          ${
            certRound
              ? html`<p class="lede" data-projector="lede">${CONTENT.announcement.text.replace('{certCost}', LM_CERT_COST)}</p>`
              : ''
          }
          ${ri > 0 && this.rounds[ri - 1].revealed ? this._recap(ri - 1) : ''}

          ${renderDispatch({
            title: `Раздача · раунд ${ri + 1}`,
            rows: dispatchRows,
            sent: this.sent[ri],
            onSent: (name) => this._markSent(ri, name),
          })}

          <h3>Цены продавцов</h3>
          <div class="entry-head number-choice"><div>Продавец</div><div>Цена</div><div></div></div>
          ${round.lots.map((l) => this._priceRow(ri, l))}

          <h3>Витрина</h3>
          ${this._showcase(ri)}
          ${pricesIn ? this._buyerPanel(ri) : html`<p class="mini-note">Покупки начнутся, когда все продавцы назовут цену или откажутся продавать.</p>`}

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(screen - 1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            ${
              round.revealed
                ? html`<button
                    class="primary"
                    data-testid="next-btn-${screen}"
                    @click=${() => (last ? this.flow.advance(RESULTS, () => this._showResults()) : this.flow.advance(screen + 1))}
                  >
                    ${last ? 'Показать результаты' : `Раунд ${ri + 2}`} ${unsafeHTML(ICON_RIGHT)}
                  </button>`
                : html`<button
                    class="primary"
                    data-testid="reveal-btn-${screen}"
                    ?disabled=${!pricesIn || !allPicked}
                    @click=${() => this._patchRound(ri, (r) => ({ ...r, revealed: true }))}
                  >
                    Раскрыть качество
                  </button>`
            }
          </div>
        </div>
        ${this.flow.lock(screen)}
      </section>
    `;
  }

  render() {
    const r = this.results;
    const pct = (v) => (v === null || v === undefined ? '—' : v);
    const pctSign = (v) => (v === null || v === undefined ? '—' : `${v}%`);
    return html`
      <div class="wrap-wide" style=${gameAccentStyle(GAME_ID)}>
        <retro-projector-button></retro-projector-button>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
            <section class="${this.flow.roundClass(0)}" id="round-0">
              <div class="round-body">
                <p class="eyebrow" data-projector="eyebrow">Командное упражнение · 20 минут</p>
                <h1 data-projector="title">Рынок «лимонов»</h1>
                <p class="lede">Рынок подержанных машин: продавцы знают качество, покупатели — нет.</p>
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
                <div class="nav-row">
                  <span></span>
                  <button class="primary" @click=${() => this.flow.advance(ROLES)}>Распределить роли ${unsafeHTML(ICON_RIGHT)}</button>
                </div>
              </div>
              ${this.flow.lock(0)}
            </section>

            <section class="${this.flow.roundClass(ROLES)}" id="round-${ROLES}">
              <div class="round-body">
                <p class="eyebrow" data-projector="eyebrow">Роли</p>
                <h2 data-projector="title">Кто продаёт, кто покупает</h2>
                <p class="lede">Роли не меняются всю игру. Продавцов — ${this.market.sellers.length}, покупателей — ${this.market.buyers.length}.</p>
                <div class="role-groups">
                  <div class="role-group-col role-group-a">
                    <div class="role-group-title">Продавцы</div>
                    <div class="role-group-chips">${this.market.sellers.map((n) => html`<span class="role-chip readonly">${unsafeHTML(avatarName(n))}</span>`)}</div>
                  </div>
                  <div class="role-group-col role-group-b">
                    <div class="role-group-title">Покупатели</div>
                    <div class="role-group-chips">${this.market.buyers.map((n) => html`<span class="role-chip readonly">${unsafeHTML(avatarName(n))}</span>`)}</div>
                  </div>
                </div>
                <div class="nav-row">
                  <button class="ghost" @click=${() => this.flow.scrollTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
                  <button class="ghost" @click=${() => this._reshuffle()}>${unsafeHTML(ICON_SHUFFLE)} Перемешать</button>
                  <button class="primary" data-testid="next-btn-${ROLES}" @click=${() => this.flow.advance(FIRST_ROUND, () => this._save())}>
                    Раунд 1 ${unsafeHTML(ICON_RIGHT)}
                  </button>
                </div>
              </div>
              ${this.flow.lock(ROLES)}
            </section>

            ${this.rounds.map((_, i) => this._roundSection(i))}

            <section class="${this.flow.roundClass(RESULTS)}" id="round-${RESULTS}">
              <div class="round-body">
                <p class="eyebrow" data-projector="eyebrow">Результаты</p>
                <h2 data-projector="title">Что получилось на вашем рынке</h2>
                ${renderReveal({
                  // first round → the round with the inspection; every round is in the verdict
                  value: r
                    ? `${pctSign(r.goodSoldByRound[0])} → ${pctSign(r.goodSoldByRound[LM_ROUNDS - 1])}`
                    : '—',
                  ...REVEAL_COPY.lemons(r),
                })}
                ${r ? renderLeaderboard({ rows: rankScores(r.people.map((p) => ({ name: p.name, score: p.total }))), unit: ['очко', 'очка', 'очков'], signed: true }) : ''}

                <div class="d3-chart-card" data-projector="chart">
                  <div class="d3-chart-title">Сколько хороших машин было на рынке</div>
                  <svg id="lm-chart" class="d3-chart-svg" role="img" aria-label="Доля хороших машин среди выставленных и проданных по раундам"></svg>
                  <p class="d3-chart-cap">Сплошная — среди купленных, пунктир — среди выставленных на витрину. Качество раздавалось 50 на 50, так что «честный» рынок держался бы около 50%.</p>
                </div>
                <table class="results-table">
                  <thead><tr><th>Раунд</th><th>Выставлено</th><th>Продано</th><th>Хороших среди проданных</th><th>Средняя цена</th><th>Выгода рынка</th></tr></thead>
                  <tbody>
                    ${
                      r
                        ? r.stats.map(
                            (s, i) => html`
                              <tr>
                                <td>${i + 1}${i + 1 === LM_CERT_ROUND ? ' (проверка)' : ''}</td>
                                <td>${s ? s.listed : '—'}</td>
                                <td>${s ? s.sold : '—'}</td>
                                <td>${s ? `${s.goodSold} (${pct(s.goodShareSold)}%)` : '—'}</td>
                                <td>${s ? pct(s.avgPrice) : '—'}</td>
                                <td>${s ? `${s.surplus} из ${s.maxSurplus}` : '—'}</td>
                              </tr>
                            `,
                          )
                        : ''
                    }
                  </tbody>
                </table>
                <table class="results-table">
                  <thead><tr><th>Участник</th><th>Роль</th><th>Итог</th></tr></thead>
                  <tbody>
                    ${
                      r
                        ? r.people.map(
                            (p) =>
                              html`<tr><td class="name">${unsafeHTML(avatarName(p.name))}</td><td>${p.role}</td><td>${formatSigned(p.total)}</td></tr>`,
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
                  <button class="ghost" @click=${() => this.flow.scrollTo(RESULTS - 1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
                  <button class="primary" @click=${() => this.flow.advance(CONTEXT)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
                </div>
              </div>
              ${this.flow.lock(RESULTS)}
            </section>

            <section class="${this.flow.roundClass(CONTEXT)}" id="round-${CONTEXT}">
              <div class="round-body">
                <p class="eyebrow" data-projector="eyebrow">А теперь — контекст</p>
                <h1 data-projector="title">Рынок «лимонов»</h1>
                ${renderContext(CONTENT.context, {
                  goodSoldR1: pct(r?.goodSoldByRound[0]),
                  goodSoldR3: pct(r?.goodSoldByRound[2]),
                  goodSoldR4: pct(r?.goodSoldByRound[3]),
                })}
                <hr />
                <h2>Ещё немного фактов</h2>
                ${renderFacts(CONTENT.facts)}
                <div class="nav-row">
                  <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
                  <span></span>
                </div>
              </div>
              ${this.flow.lock(CONTEXT)}
            </section>
          </div>

          <aside class="game-rail">
            <div class="game-rail-title">Рынок «лимонов»</div>
            ${renderTrail({ current: this.flow.activeRound, total: TOTAL_SCREENS, gameId: GAME_ID, stepLabels: ROUND_TITLES })}
          </aside>
        </div>
      </div>
    `;
  }
}

// A saved market is offered back only if it was set up for the same team size.
function loadDraft(loaded, people) {
  const p = loaded?.payload;
  if (!p?.market || !Array.isArray(p.rounds)) return null;
  return p.market.sellers.length + p.market.buyers.length === people ? loaded : null;
}

customElements.define('retro-game-lemons', RetroGameLemons);
