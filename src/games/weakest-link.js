/* =========================================================
   GAME: Слабое звено (weakest-link)
   The minimum-effort game: 5 rounds, everyone secretly picks an
   effort 1–7, the team's payoff is set by the smallest one. The
   projector only ever shows the distribution and the minimum —
   never who chose what. Before round 4 the team gets one minute to
   talk (cheap talk: promises bind nobody), so the results can show
   whether words alone pulled the team out of the trap.

   Same Lit/Shadow DOM pattern as the other games (see dictator.js's
   header): RoundFlowController for the scroll, RoundTimers for the
   answer timers, ProjectorController for the public copy, Persist
   for the draft.
========================================================= */

import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { drawLines } from '../charts/lines.js';
import CONTENT from '../content/weakest-link.json';
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
import { countFilled, hasEnough, loadableDraft, patchRow } from '../logic/entries.js';
import { rankScores } from '../logic/leaderboard.js';
import { projectorEntries } from '../logic/projector-entries.js';
import {
  EFFORTS,
  WL_ROUNDS,
  WL_TALK_ROUND,
  weakestLinkResults,
  weakestLinkRound,
  wlPayoff,
} from '../logic/weakest-link.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const GAME_ID = 'weakest-link';
const ROUND_TIMER_SECONDS = 20;
const TALK_SECONDS = 60;
const RESULTS = WL_ROUNDS + 1;
const CONTEXT = WL_ROUNDS + 2;
const TOTAL_SCREENS = WL_ROUNDS + 3;
const ROUND_TITLES = [
  'Слабое звено — правила',
  ...Array.from({ length: WL_ROUNDS }, (_, i) =>
    i + 1 === WL_TALK_ROUND
      ? `Раунд ${i + 1}: сначала минута на разговор`
      : `Раунд ${i + 1} из ${WL_ROUNDS}`,
  ),
  'Что получилось у вашей команды',
  'Слабое звено',
];

export class RetroGameWeakestLink extends LitElement {
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
    this.charts = new ChartController(this, [
      {
        id: 'wl-chart',
        when: () => this.results,
        draw: (svg, theme) => this._drawChart(svg, theme),
      },
    ]);
    this.timers = new RoundTimers(this, { seconds: ROUND_TIMER_SECONDS, count: WL_ROUNDS });
    this.talkTimer = new RoundTimers(this, { seconds: TALK_SECONDS, count: 1 });
    this.projector = new ProjectorController(this, GAME_ID, {
      entries: (round) => this._projectorEntries(round),
    });
    this.draft = loadableDraft(Persist.load(GAME_ID), { key: 'data', length: this.names.length });
  }

  _blankData() {
    return this.names.map((name) => ({ name, efforts: Array(WL_ROUNDS).fill(null) }));
  }

  _restoreDraft() {
    this.flow.advance(1, () => {
      this.data = this.draft.payload.data;
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

  _setEffort(idx, round, effort) {
    const efforts = this.data[idx].efforts.slice();
    efforts[round] = efforts[round] === effort ? null : effort;
    this.data = patchRow(this.data, idx, { efforts });
    Persist.save(GAME_ID, { data: this.data });
  }

  _filled(round) {
    return countFilled(this.data, (r) => r.efforts[round] !== null);
  }

  // Anonymous: the room sees the efforts that are in, sorted, never whose.
  _projectorEntries(screen) {
    if (screen < 1 || screen > WL_ROUNDS) return null;
    const round = screen - 1;
    return projectorEntries({
      title: 'Выбранные усилия (без имён)',
      total: this.data.length,
      anonymous: true,
      rows: this.data.map((d) => ({
        key: d.efforts[round],
        complete: d.efforts[round] !== null,
        cells: [{ label: 'Усилие', value: d.efforts[round] }],
      })),
    });
  }

  _drawChart(svg, theme) {
    const r = this.results;
    drawLines(svg, {
      xLabels: Array.from({ length: WL_ROUNDS }, (_, i) => `Раунд ${i + 1}`),
      series: [
        { label: 'Минимум в команде', color: theme.accentDeep, values: r.minByRound },
        { label: 'Среднее усилие', color: theme.gold, values: r.avgEffortByRound, dash: true },
      ],
      yDomain: [0, 7],
      theme,
    });
  }

  _showResults() {
    this.results = weakestLinkResults(this.data);
    ReportExport.register(
      GAME_ID,
      {
        subtitle: 'Результат команды определяет тот, кто вложился меньше всех.',
        meta: ReportExport.meta(this.data.length, `${WL_ROUNDS} раундов`),
        explanation:
          'Игра минимального усилия: выигрыш каждого зависит от самого маленького усилия в команде. Van Huyck, Battalio & Beil (1990): в больших группах усилия быстро сползают к минимуму — одного осторожного хватает, чтобы остальные перестали стараться.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear(GAME_ID);
    this.timers.resetAll();
    this.talkTimer.resetAll();
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  _payoffTable() {
    return html`
      <table class="payoff-table" data-projector="body">
        <thead>
          <tr>
            <th>ваш выбор \\ минимум</th>
            ${EFFORTS.slice()
              .reverse()
              .map((m) => html`<th>${m}</th>`)}
          </tr>
        </thead>
        <tbody>
          ${EFFORTS.slice()
            .reverse()
            .map(
              (own) => html`
                <tr>
                  <th>${own}</th>
                  ${EFFORTS.slice()
                    .reverse()
                    .map((min) =>
                      min > own
                        ? html`<td class="na">—</td>`
                        : html`<td class=${min === own && (own === 7 || own === 1) ? 'hi' : ''}>${wlPayoff(own, min)}</td>`,
                    )}
                </tr>
              `,
            )}
        </tbody>
      </table>
    `;
  }

  // The previous round in numbers — aggregates only.
  _recap(round) {
    const s = weakestLinkRound(this.data, round);
    if (!s) return '';
    return html`
      <div class="round-recap" data-projector="body">
        <div class="round-recap-title">Как прошёл раунд ${round + 1}</div>
        <div class="round-recap-stats">
          <div class="round-recap-stat">
            <div class="n">${s.min}</div>
            <div class="lab">минимум в команде</div>
          </div>
          <div class="round-recap-stat">
            <div class="n">${s.counts[6]} из ${s.n}</div>
            <div class="lab">выбрали 7</div>
          </div>
          <div class="round-recap-stat">
            <div class="n">${Math.round(s.avgPayoff)}</div>
            <div class="lab">средний выигрыш за раунд</div>
          </div>
        </div>
        <p class="note round-recap-note">
          Сколько человек выбрали каждое усилие:
          ${EFFORTS.map((e, i) => `${e} — ${s.counts[i]}`).join(' · ')}
        </p>
      </div>
    `;
  }

  _entryRow(row, idx, round) {
    return html`
      <div class="entry-row choice-col">
        <div class="name">${unsafeHTML(avatarName(row.name))}</div>
        <div class="toggle-pair multi" role="group" aria-label="${row.name}: усилие в раунде ${round + 1}">
          ${EFFORTS.map(
            (e) => html`<button
              type="button"
              class=${row.efforts[round] === e ? 'on' : ''}
              @click=${() => this._setEffort(idx, round, e)}
            >
              ${e}
            </button>`,
          )}
        </div>
      </div>
    `;
  }

  _roundSection(round) {
    const screen = round + 1;
    const filled = this._filled(round);
    const last = round === WL_ROUNDS - 1;
    const talk = round + 1 === WL_TALK_ROUND;
    return html`
      <section class="${this.flow.roundClass(screen)}" id="round-${screen}">
        <div class="round-body">
          <p class="eyebrow" data-projector="eyebrow">Раунд ${round + 1} из ${WL_ROUNDS}</p>
          <h2 data-projector="title" data-projector-text="Какое усилие вы выбираете: от 1 до 7?">
            Впишите усилие каждого
          </h2>
          ${round > 0 ? this._recap(round - 1) : ''}
          ${
            talk
              ? html`
                <div class="round-recap">
                  <div class="round-recap-title">Сначала — минута на разговор</div>
                  ${renderNote(
                    '«У вас минута, можно обсуждать всё что угодно. Потом снова тайный выбор. Обещания ни к чему не обязывают.»',
                  )}
                  ${this.talkTimer.card(0, { compact: true, runningLabel: 'на разговор' })}
                </div>
              `
              : ''
          }
          ${this.timers.card(round, { compact: true, runningLabel: 'на решение' })}

          <div class="entry-head choice-col">
            <div>Участник</div>
            <div>Усилие (1–7)</div>
          </div>
          <div data-testid="entry-body-${screen}">
            ${this.data.map((row, i) => this._entryRow(row, i, round))}
          </div>

          <div class="fill-progress">
            Заполнено: <span>${filled}</span> из <span>${this.names.length}</span>
            <div class="track"><div style="width:${(filled / this.names.length) * 100}%"></div></div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(screen - 1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              data-testid="next-btn-${screen}"
              ?disabled=${!hasEnough(filled)}
              @click=${() => {
                this.timers.reset();
                this.talkTimer.reset();
                if (last) this.flow.advance(RESULTS, () => this._showResults());
                else this.flow.advance(screen + 1);
              }}
            >
              ${last ? 'Показать результаты' : `Раунд ${round + 2}`} ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
        </div>
        ${this.flow.lock(screen)}
      </section>
    `;
  }

  render() {
    const r = this.results;
    const mins = r ? r.minByRound.filter((m) => m !== null) : [];
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
                <p class="eyebrow" data-projector="eyebrow">Командное упражнение · 12 минут</p>
                <h1 data-projector="title">Слабое звено</h1>
                <p class="lede">
                  Пять раундов. Выигрыш каждого зависит от самого маленького усилия в команде.
                </p>

                ${renderRules(CONTENT.rules)}

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

                ${renderSteps(CONTENT.intro.steps)}
                ${this._payoffTable()}
                ${renderNote(CONTENT.intro.note)}

                <div class="nav-row">
                  <span></span>
                  <button class="primary" @click=${() => this.flow.advance(1)}>Раунд 1 ${unsafeHTML(ICON_RIGHT)}</button>
                </div>
              </div>
              ${this.flow.lock(0)}
            </section>

            ${Array.from({ length: WL_ROUNDS }, (_, i) => this._roundSection(i))}

            <section class="${this.flow.roundClass(RESULTS)}" id="round-${RESULTS}">
              <div class="round-body">
                <p class="eyebrow" data-projector="eyebrow">Результаты</p>
                <h2 data-projector="title">Что получилось у вашей команды</h2>

                ${renderReveal({
                  // first → last: the whole chain is in the verdict, and a long headline won't fit the projector
                  value: mins.length ? `${mins[0]} → ${mins[mins.length - 1]}` : '—',
                  ...REVEAL_COPY.weakestLink(r ? { ...r, talkRound: WL_TALK_ROUND } : null),
                })}

                ${r ? renderLeaderboard({ rows: rankScores(r.people.map((p) => ({ name: p.name, score: p.total }))), unit: ['очко', 'очка', 'очков'] }) : ''}

                <div class="d3-chart-card" data-projector="chart">
                  <div class="d3-chart-title">Минимум и среднее усилие по раундам</div>
                  <svg id="wl-chart" class="d3-chart-svg" role="img" aria-label="Минимальное и среднее усилие команды в каждом раунде"></svg>
                  <p class="d3-chart-cap">Сплошная линия — минимум, от которого зависел выигрыш всех. Пунктир — среднее усилие: насколько команда в целом готова была стараться. Разговор был перед раундом ${WL_TALK_ROUND}.</p>
                </div>

                <table class="results-table">
                  <thead>
                    <tr>
                      <th>Участник</th>
                      ${Array.from({ length: WL_ROUNDS }, (_, i) => html`<th>Р${i + 1}</th>`)}
                      <th>Выигрыш</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${
                      r
                        ? r.people.map(
                            (p) => html`
                              <tr>
                                <td class="name">${unsafeHTML(avatarName(p.name))}</td>
                                ${p.efforts.map((e) => html`<td>${e ?? '—'}</td>`)}
                                <td>${p.total}</td>
                              </tr>
                            `,
                          )
                        : ''
                    }
                    ${
                      r
                        ? html`<tr>
                            <td><b>Минимум</b></td>
                            ${r.minByRound.map((m) => html`<td><b>${m ?? '—'}</b></td>`)}
                            <td></td>
                          </tr>`
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
                  <button class="ghost" @click=${() => this.flow.scrollTo(WL_ROUNDS)}>${unsafeHTML(ICON_LEFT)} Назад</button>
                  <button class="primary" @click=${() => this.flow.advance(CONTEXT)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
                </div>
              </div>
              ${this.flow.lock(RESULTS)}
            </section>

            <section class="${this.flow.roundClass(CONTEXT)}" id="round-${CONTEXT}">
              <div class="round-body">
                <p class="eyebrow" data-projector="eyebrow">А теперь — контекст</p>
                <h1 data-projector="title">Слабое звено</h1>
                ${renderContext(CONTENT.context)}
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
            <div class="game-rail-title">Слабое звено</div>
            ${renderTrail({ current: this.flow.activeRound, total: TOTAL_SCREENS, gameId: GAME_ID, stepLabels: ROUND_TITLES })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-weakest-link', RetroGameWeakestLink);
