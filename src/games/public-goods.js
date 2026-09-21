/* =========================================================
   GAME: Общественное благо (public-goods)
   Two rounds instead of one: same pool, same rules, fresh
   100 фишек each time. Classic finding in the literature is
   that contributions decline when the exact same group plays
   more than once — round 2 lets the team test that directly
   on themselves instead of just reading about it in the facts.

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   same pattern as the src/games/dictator.js pilot (Phase 2): see that
   file's header comment for the architecture notes (declarative
   screen switching, draft banner, ReportExport.register(..., this.renderRoot),
   data-testid test hooks). This game has no chart, so it's actually
   simpler than dictator — no imperative SVG-drawing step at all.
========================================================= */

import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { tipHtml } from '../charts/kit.js';
import { drawSwarm } from '../charts/swarm.js';
import CONTENT from '../content/public-goods.json';
import { renderContext, renderFacts, renderNote, renderSteps } from '../content.js';
import { ChartController } from '../controllers/chart-controller.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { RoundTimers } from '../controllers/round-timers.js';
import { confirmExit, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_DOWNLOAD, ICON_LEFT, ICON_RIGHT, ICON_X } from '../icons.js';
import {
  countFilled,
  hasEnough,
  hasFields,
  loadableDraft,
  parseNumberInput,
  patchRow,
} from '../logic/entries.js';
import { escapeHtml, formatSigned } from '../logic/format.js';
import { publicGoodsResults, publicGoodsSummary } from '../logic/results.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const STAKE = 100;
const VARS = { stake: STAKE }; // filled into {stake} in the content texts
const ROUND_TIMER_SECONDS = 20;
const TOTAL_SCREENS = 5;
const ROUND_TITLES = [
  'Общий котёл — дважды подряд',
  'Впишите вклад каждого участника',
  `Снова ${STAKE} фишек, тот же котёл`,
  'Что получилось у вашей команды',
  'Общественное благо',
];

export class RetroGamePublicGoods extends LitElement {
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
        id: 'pg-chart',
        when: () => this.results,
        draw: (svg, theme) => this._drawChart(svg, theme),
      },
    ]);
    // One 20s timer, live for one round at a time; each round keeps its own length.
    this.timers = new RoundTimers(this, { seconds: ROUND_TIMER_SECONDS, count: 2 });

    this.draft = loadableDraft(Persist.load('public-goods'), {
      key: 'data',
      length: this.names.length,
    });
  }

  _blankData() {
    return this.names.map((n) => ({ name: n, r1: null, r2: null }));
  }

  _restoreDraft() {
    this.flow.advance(1, () => {
      this.data = this.draft.payload.data;
      this.draft = null;
    });
  }

  _discardDraft() {
    Persist.clear('public-goods');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('public-goods');
    renderHome();
  }

  _onEntryInput(e, idx, field) {
    this.data = patchRow(this.data, idx, {
      [field]: parseNumberInput(e.target.value, { min: 0, max: STAKE }),
    });
    Persist.save('public-goods', { data: this.data });
  }

  // Both rounds as swarm lanes with a line per person — see who moved, and which way.
  _drawChart(svg, theme) {
    const { filled, s1, s2 } = this.results;
    const lane = (label, color, field, avg) => ({
      label,
      color,
      domain: [0, STAKE],
      ticks: [0, 25, 50, 75, 100],
      refs: [{ value: avg, label: `в среднем ${Math.round(avg * 10) / 10}`, color: theme.gold }],
      points: filled.map((d) => ({
        id: d.name,
        value: d[field],
        tip: tipHtml(escapeHtml(d.name), [
          ['Раунд 1', `${d.r1} из ${STAKE}`],
          ['Раунд 2', `${d.r2} из ${STAKE}`],
          ['Изменение', `${d.r2 - d.r1 >= 0 ? '+' : ''}${d.r2 - d.r1}`],
        ]),
      })),
    });
    drawSwarm(svg, {
      lanes: [
        lane('Раунд 1', theme.accent, 'r1', s1.avg),
        lane('Раунд 2', theme.accentDeep, 'r2', s2.avg),
      ],
      links: true,
      theme,
    });
  }

  // The timer card shown above a round's entry table.
  _roundTimer(round) {
    return this.timers.card(round, { compact: true, runningLabel: 'на решение' });
  }

  // Round 1 in numbers, shown at the top of round 2 so people can orient by it if
  // they forgot how it went. Aggregates only — nobody's individual number.
  _round1Recap() {
    const s = publicGoodsSummary(this.data, 'r1', STAKE);
    if (!s) return '';
    const r = (v) => Math.round(v * 10) / 10;
    return html`
      <div class="round-recap" id="round1-recap">
        <div class="round-recap-title">Как прошёл раунд 1</div>
        <div class="round-recap-stats">
          <div class="round-recap-stat">
            <div class="n">${r(s.avg)}</div>
            <div class="lab">в среднем вложили из ${STAKE} (от ${s.min} до ${s.max})</div>
          </div>
          <div class="round-recap-stat">
            <div class="n">${r(s.pot)}</div>
            <div class="lab">стало в котле после удвоения (вложили ${r(s.total)})</div>
          </div>
          <div class="round-recap-stat">
            <div class="n">${r(s.share)}</div>
            <div class="lab">получил каждый из котла — вложил он или нет</div>
          </div>
        </div>
        <p class="note round-recap-note">
          Кто вложил всё, остался с ${r(s.fullContributorGets)}; кто не вложил ничего — с
          ${r(s.freeRiderGets)}.${s.freeRiders ? ` Ничего не вложили: ${s.freeRiders} чел.` : ''}${s.fullContributors ? ` Вложили всё: ${s.fullContributors} чел.` : ''}
        </p>
      </div>
    `;
  }

  _filledCount(field) {
    return countFilled(this.data, hasFields(field));
  }

  _showResults() {
    this.results = publicGoodsResults(this.data, STAKE);
    const { filled } = this.results;

    ReportExport.register(
      'public-goods',
      {
        subtitle:
          'Группе выгодно вкладываться всем — каждому по отдельности выгоднее не вкладываться.',
        meta: ReportExport.meta(filled.length, '2 раунда'),
        explanation:
          'Группе выгодно, если вкладываются все, но каждому по отдельности выгоднее не вкладываться, а пользоваться чужим вкладом — классическая «проблема безбилетника». Один из первых систематических экспериментов — Marwell G., Ames R. (1979); устойчивый результат в литературе — вклады обычно снижаются при повторении игры с одной и той же группой.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear('public-goods');
    this.timers.resetAll();
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  _entryRow(row, idx, field) {
    return html`
      <div class="entry-row two-col">
        <div class="name">${unsafeHTML(avatarName(row.name))}</div>
        <input
          type="number"
          min="0"
          max="${STAKE}"
          inputmode="numeric"
          aria-label="${row.name}: ${field === 'r1' ? 'раунд 1' : 'раунд 2'}, вклад (0–${STAKE})"
          placeholder="0–${STAKE}"
          .value=${row[field] ?? ''}
          @input=${(e) => this._onEntryInput(e, idx, field)}
        />
      </div>
    `;
  }

  render() {
    const filled1 = this._filledCount('r1');
    const filled2 = this._filledCount('r2');
    const r = this.results;

    return html`
      <div class="wrap-wide" style=${gameAccentStyle('public-goods')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
          <p class="eyebrow">Командное упражнение · 10 минут</p>
          <h1>Общий котёл — дважды подряд</h1>
          <p class="lede">
            Два раунда с одной и той же группой. Правила не меняются — интересно как раз то,
            изменится ли поведение.
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

          ${renderSteps(CONTENT.intro.steps, VARS)}

          ${renderNote(CONTENT.intro.note)}

          <div class="nav-row">
            <span></span>
            <button class="primary" @click=${() => this.flow.advance(1)}>Раунд 1 ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(0)}
        </section>

        <section class="${this.flow.roundClass(1)}" id="round-1">
          <div class="round-body">
          <p class="eyebrow">Раунд 1 из 2</p>
          <h2>Впишите вклад каждого участника</h2>
          <p class="lede">Сколько из ${STAKE} фишек каждый вложил в общий котёл.</p>

          ${this._roundTimer(0)}

          <div class="entry-head two-col">
            <div>Участник</div>
            <div>Вклад (0–${STAKE})</div>
          </div>
          <div data-testid="entry-body-1">
            ${this.data.map((row, i) => this._entryRow(row, i, 'r1'))}
          </div>

          <div class="fill-progress">
            Заполнено: <span>${filled1}</span> из <span>${this.names.length}</span>
            <div class="track">
              <div style="width:${(filled1 / this.names.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              data-testid="next-btn-1"
              ?disabled=${!hasEnough(filled1)}
              @click=${() => {
                this.timers.reset();
                this.flow.advance(2);
              }}
            >
              Раунд 2 ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(1)}
        </section>

        <section class="${this.flow.roundClass(2)}" id="round-2">
          <div class="round-body">
          <p class="eyebrow">Раунд 2 из 2</p>
          <h2>Снова ${STAKE} фишек, тот же котёл</h2>
          <p class="lede">Те же правила, новая попытка — с теми же людьми.</p>

          ${this._round1Recap()}

          ${this._roundTimer(1)}

          <div class="entry-head two-col">
            <div>Участник</div>
            <div>Вклад (0–${STAKE})</div>
          </div>
          <div data-testid="entry-body-2">
            ${this.data.map((row, i) => this._entryRow(row, i, 'r2'))}
          </div>

          <div class="fill-progress">
            Заполнено: <span>${filled2}</span> из <span>${this.names.length}</span>
            <div class="track">
              <div style="width:${(filled2 / this.names.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              data-testid="next-btn-2"
              ?disabled=${!hasEnough(filled2)}
              @click=${() => {
                this.timers.reset();
                this.flow.advance(3, () => this._showResults());
              }}
            >
              Показать результаты ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(2)}
        </section>

        <section class="${this.flow.roundClass(3)}" id="round-3">
          <div class="round-body">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>

          ${renderReveal({ value: r ? (r.delta >= 0 ? '+' : '') + r.delta.toFixed(1) : '—', ...REVEAL_COPY.publicGoods(r ? { avgR1: r.s1.avg, avgR2: r.s2.avg, delta: r.delta, stake: STAKE } : null) })}

          <div class="group-compare">
            <div class="g low">
              <div class="t">Раунд 1 · средний вклад</div>
              <div class="v">${r ? r.s1.avg.toFixed(1) : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Раунд 2 · средний вклад</div>
              <div class="v">${r ? r.s2.avg.toFixed(1) : '—'}</div>
            </div>
          </div>

          <div class="stat-row">
            <div class="stat">
              <div class="n">${r ? r.s1.totalPayoff : '—'}</div>
              <div class="lab">общая выгода группы, раунд 1</div>
            </div>
            <div class="stat">
              <div class="n">${r ? r.s2.totalPayoff : '—'}</div>
              <div class="lab">общая выгода группы, раунд 2</div>
            </div>
          </div>

          <div class="d3-chart-card">
            <div class="d3-chart-title">Кто сколько вложил — два раунда</div>
            <svg id="pg-chart" class="d3-chart-svg" role="img" aria-label="Вклад каждого участника в раунде 1 и раунде 2, соединённые линией"></svg>
            <p class="d3-chart-cap">Точка — один человек. Линия соединяет его вклады в двух раундах: видно, кто сдвинулся и куда. Пунктир — среднее по команде.</p>
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Раунд 1</th>
                <th>Раунд 2</th>
                <th>Изменение</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.filled.map((d) => {
                      return html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                        <td>${d.r1}</td>
                        <td>${d.r2}</td>
                        <td>${formatSigned(d.r2 - d.r1)}</td>
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
            <button class="ghost" @click=${() => this.flow.scrollTo(2)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.flow.advance(4)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(3)}
        </section>

        <section class="${this.flow.roundClass(4)}" id="round-4">
          <div class="round-body">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Общественное благо</h1>
          ${renderContext(CONTENT.context)}

          <hr />
          <h2>Ещё немного фактов</h2>

          ${renderFacts(CONTENT.facts)}

          <div class="nav-row">
            <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
            <span></span>
          </div>
          </div>
          ${this.flow.lock(4)}
        </section>
          </div>

          <aside class="game-rail">
            <div class="game-rail-title">Общественное благо</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'public-goods',
              stepLabels: ROUND_TITLES,
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-public-goods', RetroGamePublicGoods);
