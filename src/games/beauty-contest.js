/* =========================================================
   GAME: Угадай ⅔ от среднего (beauty-contest)
   Nagel's guessing game, four rounds: everyone secretly names a
   number 0–100, whoever is closest to ⅔ of the mean wins. The recap
   at the top of each next round is projected — the mean, the target
   and the winner by name (the one open, harmless competition in the
   set) — so the room can watch the numbers unravel toward zero.
   The results chart puts all four rounds side by side as swarm lanes.
========================================================= */

import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { tipHtml } from '../charts/kit.js';
import { drawSwarm } from '../charts/swarm.js';
import CONTENT from '../content/beauty-contest.json';
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
import { BC_MAX, BC_ROUNDS, beautyResults, beautyRound } from '../logic/beauty-contest.js';
import {
  countFilled,
  hasEnough,
  loadableDraft,
  parseNumberInput,
  patchRow,
} from '../logic/entries.js';
import { escapeHtml } from '../logic/format.js';
import { rankScores } from '../logic/leaderboard.js';
import { projectorEntries } from '../logic/projector-entries.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const GAME_ID = 'beauty-contest';
const ROUND_TIMER_SECONDS = 30;
const RESULTS = BC_ROUNDS + 1;
const CONTEXT = BC_ROUNDS + 2;
const TOTAL_SCREENS = BC_ROUNDS + 3;
const ROUND_TITLES = [
  'Угадай ⅔ от среднего — правила',
  ...Array.from({ length: BC_ROUNDS }, (_, i) => `Раунд ${i + 1} из ${BC_ROUNDS}`),
  'Что получилось у вашей команды',
  'Угадай ⅔ от среднего',
];

export class RetroGameBeautyContest extends LitElement {
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
        id: 'bc-chart',
        when: () => this.results,
        draw: (svg, theme) => this._drawChart(svg, theme),
      },
    ]);
    this.timers = new RoundTimers(this, { seconds: ROUND_TIMER_SECONDS, count: BC_ROUNDS });
    this.projector = new ProjectorController(this, GAME_ID, {
      entries: (screen) => this._projectorEntries(screen),
    });
    this.draft = loadableDraft(Persist.load(GAME_ID), { key: 'data', length: this.names.length });
  }

  _blankData() {
    return this.names.map((name) => ({ name, guesses: Array(BC_ROUNDS).fill(null) }));
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

  _onInput(e, idx, round) {
    const guesses = this.data[idx].guesses.slice();
    const v = parseNumberInput(e.target.value, { min: 0, max: BC_MAX });
    guesses[round] = v === null ? null : Math.round(v);
    this.data = patchRow(this.data, idx, { guesses });
    Persist.save(GAME_ID, { data: this.data });
  }

  // Numbers only, no names, until the round is over.
  _projectorEntries(screen) {
    if (screen < 1 || screen > BC_ROUNDS) return null;
    const round = screen - 1;
    return projectorEntries({
      title: 'Сколько чисел уже назвали',
      total: this.data.length,
      anonymous: true,
      rows: this.data.map((d) => ({
        complete: d.guesses[round] !== null,
        cells: [{ label: 'Число', value: d.guesses[round] === null ? null : 'есть' }],
      })),
    });
  }

  _drawChart(svg, theme) {
    const { rounds } = this.results;
    const colors = [theme.accent, theme.accentDeep, theme.gold, theme.red];
    drawSwarm(svg, {
      lanes: rounds
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r)
        .map(({ r, i }) => ({
          label: `Раунд ${i + 1}`,
          color: colors[i % colors.length],
          domain: [0, BC_MAX],
          ticks: [0, 10, 15, 22, 33, 50, 67, 100],
          refs: [{ value: r.target, label: `цель ${r.target}`, color: theme.gold }],
          points: r.entries.map((e) => ({
            id: e.name,
            value: e.guess,
            tip: tipHtml(escapeHtml(e.name), [
              ['Число', String(e.guess)],
              ['Цель раунда', String(r.target)],
            ]),
          })),
        })),
      links: true,
      theme,
    });
  }

  _showResults() {
    this.results = beautyResults(this.data);
    ReportExport.register(
      GAME_ID,
      {
        subtitle:
          'Чтобы выиграть, надо угадать не ответ, а то, насколько глубоко думают остальные.',
        meta: ReportExport.meta(this.data.length, `${BC_ROUNDS} раунда`),
        explanation:
          'Конкурс Кейнса в версии Розмари Нагель (1995): побеждает число, ближайшее к ⅔ среднего. Если все рассуждают до конца, ответ — 0, но на практике люди делают в среднем около полутора шагов рассуждения за других, и числа сползают к нулю только от раунда к раунду.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear(GAME_ID);
    this.timers.resetAll();
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  // Projected: the previous round's mean, target and winner.
  _recap(round) {
    const s = beautyRound(this.data, round);
    if (!s) return '';
    return html`
      <div class="round-recap" data-projector="body">
        <div class="round-recap-title">Итог раунда ${round + 1}</div>
        <div class="round-recap-stats">
          <div class="round-recap-stat">
            <div class="n">${s.mean}</div>
            <div class="lab">среднее из ${s.n} чисел</div>
          </div>
          <div class="round-recap-stat">
            <div class="n">${s.target}</div>
            <div class="lab">⅔ от среднего — цель раунда</div>
          </div>
          <div class="round-recap-stat">
            <div class="n">${s.winners.map((w) => w.guess).join(', ')}</div>
            <div class="lab">победил(и): ${s.winners.map((w) => w.name).join(', ')}</div>
          </div>
        </div>
      </div>
    `;
  }

  _roundSection(round) {
    const screen = round + 1;
    const filled = countFilled(this.data, (r) => r.guesses[round] !== null);
    const last = round === BC_ROUNDS - 1;
    return html`
      <section class="${this.flow.roundClass(screen)}" id="round-${screen}">
        <div class="round-body">
          <p class="eyebrow" data-projector="eyebrow">Раунд ${screen} из ${BC_ROUNDS}</p>
          <h2 data-projector="title" data-projector-text="Назовите целое число от 0 до 100">Впишите число каждого</h2>
          <p class="lede">Побеждает тот, кто ближе всех к ⅔ от среднего всех чисел.</p>
          ${round > 0 ? this._recap(round - 1) : ''}
          ${this.timers.card(round, { compact: true, runningLabel: 'на решение' })}
          <div class="entry-head two-col"><div>Участник</div><div>Число (0–${BC_MAX})</div></div>
          <div data-testid="entry-body-${screen}">
            ${this.data.map(
              (row, i) => html`
                <div class="entry-row two-col">
                  <div class="name">${unsafeHTML(avatarName(row.name))}</div>
                  <input
                    type="number"
                    min="0"
                    max=${BC_MAX}
                    inputmode="numeric"
                    aria-label="${row.name}: раунд ${screen}, число (0–${BC_MAX})"
                    placeholder="0–${BC_MAX}"
                    .value=${row.guesses[round] ?? ''}
                    @input=${(e) => this._onInput(e, i, round)}
                  />
                </div>
              `,
            )}
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
                if (last) this.flow.advance(RESULTS, () => this._showResults());
                else this.flow.advance(screen + 1);
              }}
            >
              ${last ? 'Показать результаты' : `Раунд ${screen + 1}`} ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
        </div>
        ${this.flow.lock(screen)}
      </section>
    `;
  }

  render() {
    const r = this.results;
    const targets = r ? r.targetByRound.filter((t) => t !== null) : [];
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
                <p class="eyebrow" data-projector="eyebrow">Командное упражнение · 10 минут</p>
                <h1 data-projector="title">Угадай ⅔ от среднего</h1>
                <p class="lede">Четыре раунда. Выигрывает тот, кто лучше всех угадает, как думают остальные.</p>
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
                ${renderNote(CONTENT.intro.note)}
                <div class="nav-row">
                  <span></span>
                  <button class="primary" @click=${() => this.flow.advance(1)}>Раунд 1 ${unsafeHTML(ICON_RIGHT)}</button>
                </div>
              </div>
              ${this.flow.lock(0)}
            </section>

            ${Array.from({ length: BC_ROUNDS }, (_, i) => this._roundSection(i))}

            <section class="${this.flow.roundClass(RESULTS)}" id="round-${RESULTS}">
              <div class="round-body">
                <p class="eyebrow" data-projector="eyebrow">Результаты</p>
                <h2 data-projector="title">Что получилось у вашей команды</h2>
                ${renderReveal({ value: targets.length ? targets.join(' → ') : '—', ...REVEAL_COPY.beautyContest(r) })}
                ${r ? renderLeaderboard({ title: 'Кто сколько раундов выиграл', rows: rankScores([...r.wins].map(([name, score]) => ({ name, score }))), unit: ['победа', 'победы', 'побед'] }) : ''}

                <div class="d3-chart-card" data-projector="chart">
                  <div class="d3-chart-title">Как числа сползали к нулю</div>
                  <svg id="bc-chart" class="d3-chart-svg" role="img" aria-label="Числа каждого участника в четырёх раундах и цель каждого раунда"></svg>
                  <p class="d3-chart-cap">Точка — число одного человека, линия соединяет его ответы по раундам. Пунктир — ⅔ от среднего, цель раунда. Отметки 33, 22, 15, 10 — первый, второй, третий и четвёртый шаг рассуждения.</p>
                </div>
                <table class="results-table">
                  <thead>
                    <tr>
                      <th>Участник</th>
                      ${Array.from({ length: BC_ROUNDS }, (_, i) => html`<th>Р${i + 1}</th>`)}
                      <th>Побед</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${
                      r
                        ? this.data.map(
                            (d) => html`
                              <tr>
                                <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                                ${d.guesses.map((g) => html`<td>${g ?? '—'}</td>`)}
                                <td>${r.wins.get(d.name) || ''}</td>
                              </tr>
                            `,
                          )
                        : ''
                    }
                    ${
                      r
                        ? html`<tr>
                            <td><b>⅔ среднего</b></td>
                            ${r.targetByRound.map((t) => html`<td><b>${t ?? '—'}</b></td>`)}
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
                  <button class="ghost" @click=${() => this.flow.scrollTo(BC_ROUNDS)}>${unsafeHTML(ICON_LEFT)} Назад</button>
                  <button class="primary" @click=${() => this.flow.advance(CONTEXT)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
                </div>
              </div>
              ${this.flow.lock(RESULTS)}
            </section>

            <section class="${this.flow.roundClass(CONTEXT)}" id="round-${CONTEXT}">
              <div class="round-body">
                <p class="eyebrow" data-projector="eyebrow">А теперь — контекст</p>
                <h1 data-projector="title">Угадай ⅔ от среднего</h1>
                ${renderContext(CONTENT.context, {
                  meanR1: r?.meanByRound[0] ?? '—',
                  targetR1: targets[0] ?? '—',
                  targetR4: targets[targets.length - 1] ?? '—',
                  zeroCount: r?.zeroCount ?? '—',
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
            <div class="game-rail-title">Угадай ⅔ от среднего</div>
            ${renderTrail({ current: this.flow.activeRound, total: TOTAL_SCREENS, gameId: GAME_ID, stepLabels: ROUND_TITLES })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-beauty-contest', RetroGameBeautyContest);
