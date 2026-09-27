/* =========================================================
   GAME: Долларовый аукцион (dollar-auction)
   Shubik's dollar auction, played live and out loud: an open
   ascending auction for a prize of 100 where the runner-up pays
   their last bid too. The facilitator taps the name of whoever
   raised; the board (projected) shows the two top bids and what the
   "auctioneer" has already made — it turns red the moment the two
   bids together are worth more than the prize. A 10-second silence
   timer restarts on every bid; when it runs out, the auction is over.
========================================================= */

import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { drawLines } from '../charts/lines.js';
import CONTENT from '../content/dollar-auction.json';
import { renderContext, renderFacts, renderNote, renderRules, renderSteps } from '../content.js';
import { ChartController } from '../controllers/chart-controller.js';
import { ProjectorController } from '../controllers/projector-controller.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { RoundTimers } from '../controllers/round-timers.js';
import { confirmExit, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_DOWNLOAD, ICON_LEFT, ICON_RIGHT, ICON_X } from '../icons.js';
import { renderLeaderboard } from '../leaderboard.js';
import {
  auctionResults,
  auctionState,
  DA_PRIZE,
  DA_START,
  DA_STEP,
} from '../logic/dollar-auction.js';
import { formatSigned } from '../logic/format.js';
import { auctionScores, rankScores } from '../logic/leaderboard.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const GAME_ID = 'dollar-auction';
const SILENCE_SECONDS = 10;
const HISTORY_SIZE = 6; // bids shown on the board
const TOTAL_SCREENS = 4;
const ROUND_TITLES = [
  'Долларовый аукцион — правила',
  'Торги',
  'Что получилось у вашей команды',
  'Долларовый аукцион',
];
const VARS = { prize: DA_PRIZE, start: DA_START, step: DA_STEP, silence: SILENCE_SECONDS };

export class RetroGameDollarAuction extends LitElement {
  static styles = sharedStyles;

  static properties = {
    bids: { state: true },
    draft: { state: true },
    results: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.bids = [];
    this.results = null;
    this.charts = new ChartController(this, [
      {
        id: 'da-chart',
        when: () => this.results,
        draw: (svg, theme) => this._drawChart(svg, theme),
      },
    ]);
    this.timers = new RoundTimers(this, { seconds: SILENCE_SECONDS, count: 1 });
    this.projector = new ProjectorController(this, GAME_ID);
    this.draft = loadDraft(Persist.load(GAME_ID));
  }

  _restoreDraft() {
    this.flow.advance(1, () => {
      this.bids = this.draft.payload.bids;
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

  _bid(name) {
    const { nextBid, leader } = auctionState(this.bids);
    if (leader?.name === name) return;
    this.bids = [...this.bids, { name, amount: nextBid }];
    Persist.save(GAME_ID, { bids: this.bids });
    this.timers.start(0); // the silence countdown starts over with every bid
  }

  _undo() {
    this.bids = this.bids.slice(0, -1);
    Persist.save(GAME_ID, { bids: this.bids });
    this.timers.reset();
  }

  _drawChart(svg, theme) {
    const r = this.results;
    drawLines(svg, {
      xLabels: r.leaderSeries.map((_, i) => `${i + 1}`),
      series: [
        { label: 'Лучшая ставка', color: theme.accentDeep, values: r.leaderSeries },
        {
          label: 'Две верхние ставки вместе',
          color: theme.red,
          values: r.revenueSeries,
          dash: true,
        },
      ],
      refs: [{ value: DA_PRIZE, label: `цена приза — ${DA_PRIZE}`, color: theme.gold }],
      xTitle: 'номер ставки',
      theme,
    });
  }

  _showResults() {
    this.results = auctionResults(this.bids);
    ReportExport.register(
      GAME_ID,
      {
        subtitle: 'Люди платят больше цены приза — лишь бы не остаться проигравшим.',
        meta: ReportExport.meta(this.names.length, `${this.bids.length} ставок`),
        explanation:
          'Долларовый аукцион (Shubik, 1971): второй по величине ставки тоже платит, поэтому каждому проигрывающему выгоднее перебить, чем остановиться. Цепочка разумных шагов приводит к тому, что двое платят за приз больше, чем он стоит. Рекорд Макса Базермана — 204 доллара за 20-долларовую купюру.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.bids = [];
    this.results = null;
    Persist.clear(GAME_ID);
    this.timers.resetAll();
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  // Projected: the two top bids, the auctioneer's take and the last few bids —
  // the room watches the escalation happen, not only where it stands.
  _board() {
    const s = auctionState(this.bids);
    const over = s.revenue > DA_PRIZE;
    const recent = this.bids
      .map((b, i) => ({ ...b, n: i + 1 }))
      .slice(-HISTORY_SIZE)
      .reverse();
    return html`
      <div class="board" data-projector="body">
        <div class="board-row">
          <div class="board-cell">
            <div class="n">${s.leader ? s.leader.amount : '—'}</div>
            <div class="lab">лидер${s.leader ? `: ${s.leader.name}` : ''}</div>
          </div>
          <div class="board-cell">
            <div class="n">${s.runnerUp ? s.runnerUp.amount : '—'}</div>
            <div class="lab">второе место${s.runnerUp ? `: ${s.runnerUp.name} — платит и ничего не получает` : ''}</div>
          </div>
          <div class="board-cell ${over ? 'alert' : ''}">
            <div class="n">${s.leader ? formatSigned(s.profit) : '—'}</div>
            <div class="lab">${over ? 'аукционист уже в плюсе' : `аукционист: две ставки против приза ${DA_PRIZE}`}</div>
          </div>
        </div>
        ${
          recent.length
            ? html`<div class="bid-history">
                <div class="bid-history-title">Последние ставки · всего ${this.bids.length}</div>
                <ol>
                  ${recent.map(
                    (b, i) => html`<li class=${i === 0 ? 'latest' : ''}>
                      <b>${b.amount}</b><span>${b.name}</span>${b.amount >= DA_PRIZE ? html`<i>дороже приза</i>` : ''}
                    </li>`,
                  )}
                </ol>
              </div>`
            : ''
        }
      </div>
    `;
  }

  render() {
    const r = this.results;
    const s = auctionState(this.bids);
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
                <p class="eyebrow" data-projector="eyebrow">Командное упражнение · 8 минут</p>
                <h1 data-projector="title">Долларовый аукцион</h1>
                <p class="lede">Открытые торги за приз в ${DA_PRIZE} очков. С одним необычным правилом.</p>
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
                  <button class="primary" @click=${() => this.flow.advance(1)}>К торгам ${unsafeHTML(ICON_RIGHT)}</button>
                </div>
              </div>
              ${this.flow.lock(0)}
            </section>

            <section class="${this.flow.roundClass(1)}" id="round-1">
              <div class="round-body">
                <p class="eyebrow" data-projector="eyebrow">Торги · приз ${DA_PRIZE}</p>
                <h2 data-projector="title">Кто больше?</h2>
                <p class="lede" data-projector="lede">
                  Второй по величине ставки тоже платит свою ставку и ничего не получает.
                </p>
                ${this._board()}
                ${this.timers.card(0, { compact: true, runningLabel: 'тишины — и торги закрыты' })}

                <p class="mini-note">Нажмите на того, кто перебил ставку: его ставка станет ${s.nextBid}.</p>
                <div class="bid-buttons" data-testid="bid-buttons">
                  ${this.names.map(
                    (n) => html`<button
                      type="button"
                      class="ghost ${s.leader?.name === n ? 'leader' : ''}"
                      ?disabled=${s.leader?.name === n}
                      @click=${() => this._bid(n)}
                    >
                      ${unsafeHTML(avatarName(n))} · ${s.nextBid}
                    </button>`,
                  )}
                </div>

                <div class="nav-row">
                  <button class="ghost" @click=${() => this.flow.scrollTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
                  <button class="ghost" ?disabled=${!this.bids.length} @click=${() => this._undo()}>Отменить последнюю ставку</button>
                  <button
                    class="primary"
                    data-testid="next-btn-1"
                    ?disabled=${this.bids.length < 1}
                    @click=${() => {
                      this.timers.reset();
                      this.flow.advance(2, () => this._showResults());
                    }}
                  >
                    Торги закрыты ${unsafeHTML(ICON_RIGHT)}
                  </button>
                </div>
              </div>
              ${this.flow.lock(1)}
            </section>

            <section class="${this.flow.roundClass(2)}" id="round-2">
              <div class="round-body">
                <p class="eyebrow" data-projector="eyebrow">Результаты</p>
                <h2 data-projector="title">Что получилось у вашей команды</h2>
                ${renderReveal({
                  value: r ? `${r.final} за ${DA_PRIZE}` : '—',
                  ...REVEAL_COPY.dollarAuction(r ? { ...r, prize: DA_PRIZE } : null),
                })}
                <div class="stat-row">
                  <div class="stat">
                    <div class="n">${r ? r.revenue : '—'}</div>
                    <div class="lab">заплатили двое вместе</div>
                  </div>
                  <div class="stat">
                    <div class="n">${r ? formatSigned(r.profit) : '—'}</div>
                    <div class="lab">аукционист против цены приза</div>
                  </div>
                  <div class="stat">
                    <div class="n">${r ? r.bids : '—'}</div>
                    <div class="lab">ставок всего</div>
                  </div>
                </div>
                ${r ? renderLeaderboard({ rows: rankScores(auctionScores(this.names, r, DA_PRIZE)), unit: ['очко', 'очка', 'очков'], signed: true }) : ''}

                <div class="d3-chart-card" data-projector="chart">
                  <div class="d3-chart-title">Как росли ставки</div>
                  <svg id="da-chart" class="d3-chart-svg" role="img" aria-label="Лучшая ставка и сумма двух верхних ставок после каждой ставки"></svg>
                  <p class="d3-chart-cap">Пунктир — сколько отдали бы двое верхних, если бы торги закончились в этот момент. Выше линии приза аукцион выгоден только организатору.</p>
                </div>
                <table class="results-table">
                  <thead><tr><th>№</th><th>Участник</th><th>Ставка</th><th>Две верхние вместе</th></tr></thead>
                  <tbody>
                    ${
                      r
                        ? this.bids.map(
                            (b, i) => html`
                              <tr>
                                <td>${i + 1}</td>
                                <td class="name">${unsafeHTML(avatarName(b.name))}</td>
                                <td>${b.amount}</td>
                                <td>${r.revenueSeries[i]}${r.revenueSeries[i] > DA_PRIZE ? ' ▲' : ''}</td>
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
                <p class="eyebrow" data-projector="eyebrow">А теперь — контекст</p>
                <h1 data-projector="title">Долларовый аукцион</h1>
                ${renderContext(CONTENT.context, {
                  ...VARS,
                  final: r?.final ?? '—',
                  revenue: r?.revenue ?? '—',
                  profit: r ? formatSigned(r.profit) : '—',
                })}
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
            <div class="game-rail-title">Долларовый аукцион</div>
            ${renderTrail({ current: this.flow.activeRound, total: TOTAL_SCREENS, gameId: GAME_ID, stepLabels: ROUND_TITLES })}
          </aside>
        </div>
      </div>
    `;
  }
}

// A saved auction is offered back only if it is a non-empty bid log.
function loadDraft(loaded) {
  const bids = loaded?.payload?.bids;
  return Array.isArray(bids) && bids.length ? loaded : null;
}

customElements.define('retro-game-dollar-auction', RetroGameDollarAuction);
