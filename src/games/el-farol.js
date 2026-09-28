/* =========================================================
   GAME: Бар «Эль Фароль» (el-farol)
   Brian Arthur's El Farol bar problem, eight quick evenings. Everyone
   secretly decides whether to go; the bar is fun only if at most 60%
   of the team show up. The full attendance history is projected
   before every evening — the same data for everyone, which is exactly
   why no forecast can work for all. From the fifth evening the team
   may talk and agree on anything (a schedule usually appears), so the
   results can compare guessing with coordinating.

   Input is one toggle per person, "Дома" by default: the facilitator
   only taps those who are going.
========================================================= */

import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { drawLines } from '../charts/lines.js';
import CONTENT from '../content/el-farol.json';
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
  EF_ROUNDS,
  EF_TALK_FROM,
  efCapacity,
  elFarolResults,
  elFarolRound,
} from '../logic/el-farol.js';
import { loadableDraft, patchRow } from '../logic/entries.js';
import { formatSigned } from '../logic/format.js';
import { rankScores } from '../logic/leaderboard.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const GAME_ID = 'el-farol';
const ROUND_TIMER_SECONDS = 10;
const RESULTS = EF_ROUNDS + 1;
const CONTEXT = EF_ROUNDS + 2;
const TOTAL_SCREENS = EF_ROUNDS + 3;
const ROUND_TITLES = [
  'Бар «Эль Фароль» — правила',
  ...Array.from({ length: EF_ROUNDS }, (_, i) =>
    i + 1 === EF_TALK_FROM ? `Вечер ${i + 1}: можно договариваться` : `Вечер ${i + 1}`,
  ),
  'Что получилось у вашей команды',
  'Бар «Эль Фароль»',
];

export class RetroGameElFarol extends LitElement {
  static styles = sharedStyles;

  static properties = {
    data: { state: true },
    draft: { state: true },
    results: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.capacity = efCapacity(this.names.length);
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.data = this._blankData();
    this.results = null;
    this.charts = new ChartController(this, [
      {
        id: 'ef-chart',
        when: () => this.results,
        draw: (svg, theme) => this._drawChart(svg, theme),
      },
    ]);
    this.timers = new RoundTimers(this, { seconds: ROUND_TIMER_SECONDS, count: EF_ROUNDS });
    this.projector = new ProjectorController(this, GAME_ID);
    this.draft = loadableDraft(Persist.load(GAME_ID), { key: 'data', length: this.names.length });
  }

  _blankData() {
    return this.names.map((name) => ({ name, go: Array(EF_ROUNDS).fill(false) }));
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

  _setGo(idx, round, go) {
    const next = this.data[idx].go.slice();
    next[round] = go;
    this.data = patchRow(this.data, idx, { go: next });
    Persist.save(GAME_ID, { data: this.data });
  }

  _drawChart(svg, theme) {
    const r = this.results;
    drawLines(svg, {
      xLabels: r.attendance.map((_, i) => `Вечер ${i + 1}`),
      series: [{ label: 'Пришло в бар', color: theme.accentDeep, values: r.attendance }],
      refs: [{ value: r.capacity, label: `мест — ${r.capacity}`, color: theme.red }],
      yDomain: [0, this.names.length],
      theme,
    });
  }

  _showResults() {
    this.results = elFarolResults(this.data, this.capacity);
    ReportExport.register(
      GAME_ID,
      {
        subtitle:
          'Если все принимают решение по одним и тем же данным, эти данные перестают работать.',
        meta: ReportExport.meta(this.data.length, `${EF_ROUNDS} вечеров · ${this.capacity} мест`),
        explanation:
          'Задача Брайана Артура (1994): бар хорош, только если пришло не больше 60% желающих. Любой прогноз, которому верят все, опровергает сам себя, поэтому посещаемость колеблется вокруг порога. Договорённость и расписание решают задачу лучше любого прогноза.',
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

  // Projected: every past evening, the same history for everyone.
  _history(upTo) {
    if (upTo === 0) return '';
    return html`
      <div data-projector="body">
        <p class="mini-note">Прошлые вечера (мест — ${this.capacity}):</p>
        <div class="history-strip">
          ${Array.from({ length: upTo }, (_, i) => {
            const e = elFarolRound(this.data, i, this.capacity);
            return html`<span class=${e.crowded ? 'crowd' : 'ok'}>Вечер ${i + 1}: ${e.came} — ${e.crowded ? 'толпа' : 'уютно'}</span>`;
          })}
        </div>
      </div>
    `;
  }

  _roundSection(round) {
    const screen = round + 1;
    const last = round === EF_ROUNDS - 1;
    const talkStart = round + 1 === EF_TALK_FROM;
    const going = this.data.filter((d) => d.go[round]).length;
    return html`
      <section class="${this.flow.roundClass(screen)}" id="round-${screen}">
        <div class="round-body">
          <p class="eyebrow" data-projector="eyebrow">Вечер ${screen} из ${EF_ROUNDS}${round + 1 >= EF_TALK_FROM ? ' · можно договариваться' : ''}</p>
          <h2 data-projector="title" data-projector-text="Идёте сегодня в бар? В баре ${this.capacity} мест">
            Кто идёт в бар?
          </h2>
          ${talkStart ? html`<p class="lede" data-projector="lede">${CONTENT.announcement.text}</p>` : ''}
          ${this._history(round)}
          ${this.timers.card(round, { compact: true, runningLabel: 'на решение' })}
          <div class="entry-head toggle-only"><div>Участник</div><div>Сегодня</div></div>
          <div data-testid="entry-body-${screen}">
            ${this.data.map(
              (row, i) => html`
                <div class="entry-row toggle-only">
                  <div class="name">${unsafeHTML(avatarName(row.name))}</div>
                  <div class="toggle-pair" role="group" aria-label="${row.name}: вечер ${screen}">
                    <button type="button" class=${row.go[round] ? 'on' : ''} @click=${() => this._setGo(i, round, true)}>Иду</button>
                    <button type="button" class=${row.go[round] ? '' : 'on'} @click=${() => this._setGo(i, round, false)}>Дома</button>
                  </div>
                </div>
              `,
            )}
          </div>
          <p class="mini-note">Идут: ${going} из ${this.names.length}, мест — ${this.capacity}.</p>
          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(screen - 1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              data-testid="next-btn-${screen}"
              @click=${() => {
                this.timers.reset();
                if (last) this.flow.advance(RESULTS, () => this._showResults());
                else this.flow.advance(screen + 1);
              }}
            >
              ${last ? 'Показать результаты' : `Вечер ${screen + 1}`} ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
        </div>
        ${this.flow.lock(screen)}
      </section>
    `;
  }

  render() {
    const r = this.results;
    const vars = {
      capacity: this.capacity,
      players: this.names.length,
      goodNightsSilent: r?.goodSilent ?? '—',
      goodNightsTalk: r?.goodTalk ?? '—',
    };
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
                <h1 data-projector="title">Бар «Эль Фароль»</h1>
                <p class="lede">Восемь вечеров, ${this.capacity} мест на ${this.names.length} человек.</p>
                ${renderRules(CONTENT.rules, vars)}

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
                ${renderSteps(CONTENT.intro.steps, vars)}
                ${renderNote(CONTENT.intro.note)}
                <div class="nav-row">
                  <span></span>
                  <button class="primary" @click=${() => this.flow.advance(1)}>Вечер 1 ${unsafeHTML(ICON_RIGHT)}</button>
                </div>
              </div>
              ${this.flow.lock(0)}
            </section>

            ${Array.from({ length: EF_ROUNDS }, (_, i) => this._roundSection(i))}

            <section class="${this.flow.roundClass(RESULTS)}" id="round-${RESULTS}">
              <div class="round-body">
                <p class="eyebrow" data-projector="eyebrow">Результаты</p>
                <h2 data-projector="title">Что получилось у вашей команды</h2>
                ${renderReveal({
                  value: r ? `${r.goodSilent + r.goodTalk} из ${EF_ROUNDS}` : '—',
                  ...REVEAL_COPY.elFarol(r),
                })}
                ${r ? renderLeaderboard({ rows: rankScores(r.people.map((p) => ({ name: p.name, score: p.points }))), unit: ['очко', 'очка', 'очков'], signed: true }) : ''}

                <div class="d3-chart-card" data-projector="chart">
                  <div class="d3-chart-title">Сколько человек пришло в бар</div>
                  <svg id="ef-chart" class="d3-chart-svg" role="img" aria-label="Посещаемость бара по вечерам и число мест"></svg>
                  <p class="d3-chart-cap">Выше красной линии — толпа. С вечера ${EF_TALK_FROM} можно было договариваться.</p>
                </div>
                <table class="results-table">
                  <thead>
                    <tr>
                      <th>Участник</th>
                      ${Array.from({ length: EF_ROUNDS }, (_, i) => html`<th>${i + 1}</th>`)}
                      <th>Очки</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${
                      r
                        ? this.data.map(
                            (d) => html`
                              <tr>
                                <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                                ${d.go.map((g) => html`<td>${g ? '●' : '·'}</td>`)}
                                <td>${formatSigned(r.people.find((p) => p.name === d.name).points)}</td>
                              </tr>
                            `,
                          )
                        : ''
                    }
                    ${
                      r
                        ? html`<tr>
                            <td><b>Пришло</b></td>
                            ${r.evenings.map((e) => html`<td><b>${e.came}${e.crowded ? '!' : ''}</b></td>`)}
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
                  <button class="ghost" @click=${() => this.flow.scrollTo(EF_ROUNDS)}>${unsafeHTML(ICON_LEFT)} Назад</button>
                  <button class="primary" @click=${() => this.flow.advance(CONTEXT)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
                </div>
              </div>
              ${this.flow.lock(RESULTS)}
            </section>

            <section class="${this.flow.roundClass(CONTEXT)}" id="round-${CONTEXT}">
              <div class="round-body">
                <p class="eyebrow" data-projector="eyebrow">А теперь — контекст</p>
                <h1 data-projector="title">Бар «Эль Фароль»</h1>
                ${renderContext(CONTENT.context, vars)}
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
            <div class="game-rail-title">Бар «Эль Фароль»</div>
            ${renderTrail({ current: this.flow.activeRound, total: TOTAL_SCREENS, gameId: GAME_ID, stepLabels: ROUND_TITLES })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-el-farol', RetroGameElFarol);
