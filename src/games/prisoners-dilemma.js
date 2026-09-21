/* =========================================================
   GAME: Дилемма заключённого (prisoners-dilemma)
   Two rounds with the SAME partner instead of one — this is
   what actually lets reciprocity (Tit for Tat and friends)
   show up: after round 1, each pair's outcome is revealed on
   a short recap screen, then round 2 lets people react to
   what their partner just did. Results compare cooperation
   between rounds and measure how often round 2 "echoed" the
   partner's round 1 move.

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   same declarative pairing/swap pattern as ultimatum.js (see that
   file's header comment), plus .toggle-pair (Сотр./Пред.) buttons
   instead of number inputs for each side of each pair — same pattern
   as false-consensus.js's Да/Нет buttons. Keeps all original plain
   ids (entry-body-1/2, next-btn-1/2, recap-table/tbody,
   results-table/tbody, ...).
========================================================= */

import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { drawStackedBars } from '../charts/bars.js';
import { tipHtml } from '../charts/kit.js';
import CONTENT from '../content/prisoners-dilemma.json';
import { renderContext, renderFacts, renderNote, renderSteps } from '../content.js';
import { ChartController } from '../controllers/chart-controller.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { confirmExit, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import {
  ICON_CLIPBOARD,
  ICON_DOWNLOAD,
  ICON_LEFT,
  ICON_RIGHT,
  ICON_SHUFFLE,
  ICON_TRIO,
  ICON_X,
} from '../icons.js';
import { dilemmaOutcomes } from '../logic/chart-data.js';
import {
  buildDilemmaEntries,
  countFilled,
  hasEnough,
  hasFields,
  loadableDraft,
  MIN_FILLED_PAIRS,
  patchRow,
} from '../logic/entries.js';
import {
  choiceLabel,
  prisonersDilemmaPayoff,
  prisonersDilemmaResults,
  prisonersDilemmaRoundRows,
} from '../logic/results.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { Roles } from '../roles.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const TOTAL_SCREENS = 7;
const ROUND_TITLES = [
  'Один партнёр, два хода',
  'Кто с кем в паре',
  'Впишите ход каждого в паре',
  'Вот что выбрала каждая пара',
  'Тот же партнёр — решайте заново',
  'Что получилось у вашей команды',
  'Дилемма заключённого',
];

export class RetroGamePrisonersDilemma extends LitElement {
  static styles = sharedStyles;

  static properties = {
    assignment: { state: true },
    entries: { state: true },
    draft: { state: true },
    results: { state: true },
    selectedSwap: { state: true },
    shuffleSpin: { state: true },
  };

  constructor() {
    super();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.assignment = Roles.makePairs(state.participants);
    this.entries = buildDilemmaEntries(this.assignment);
    this.results = null;
    this.charts = new ChartController(this, [
      {
        id: 'pd-chart',
        when: () => this.results,
        draw: (svg, theme) => this._drawChart(svg, theme),
      },
    ]);
    this.selectedSwap = null;
    this.shuffleSpin = false;

    this.draft = loadableDraft(Persist.load('prisoners-dilemma'), {
      key: 'entries',
      requires: 'assignment',
    });
  }

  _restoreDraft() {
    this.flow.advance(2, () => {
      this.assignment = this.draft.payload.assignment;
      this.entries = this.draft.payload.entries;
      this.draft = null;
    });
  }

  _discardDraft() {
    Persist.clear('prisoners-dilemma');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('prisoners-dilemma');
    renderHome();
  }

  _onShuffle() {
    this.assignment = Roles.makePairs(state.participants);
    this.selectedSwap = null;
    this.shuffleSpin = true;
    setTimeout(() => {
      this.shuffleSpin = false;
    }, 350);
  }

  // Tracked by exact slot ({ i: pair index, side: 'a'|'b' }), not by
  // name — a trio member sits in two different pair slots at once
  // (see roles.js's swapPairsAt), so identifying the clicked slot by
  // name alone can't tell them apart and silently corrupts the trio.
  _onSwapClick(i, side) {
    if (this.selectedSwap === null) {
      this.selectedSwap = { i, side };
      return;
    }
    if (this.selectedSwap.i === i && this.selectedSwap.side === side) {
      this.selectedSwap = null;
      return;
    }
    Roles.swapPairsAt(this.assignment.pairs, this.selectedSwap, { i, side });
    this.selectedSwap = null;
    this.assignment = { ...this.assignment };
  }

  _lockPairs() {
    this.flow.advance(2, () => {
      this.entries = buildDilemmaEntries(this.assignment);
    });
  }

  _onToggle(idx, side, round, val) {
    const field = (round === 1 ? 'r1' : 'r2') + side;
    this.entries = patchRow(this.entries, idx, { [field]: val });
    Persist.save('prisoners-dilemma', { assignment: this.assignment, entries: this.entries });
  }

  _filledCount(round) {
    const fieldA = round === 1 ? 'r1a' : 'r2a';
    const fieldB = round === 1 ? 'r1b' : 'r2b';
    return countFilled(this.entries, hasFields(fieldA, fieldB));
  }

  _showRecap() {
    this.flow.advance(3);
  }

  // What the pairs actually did in each round: both cooperated / one was betrayed / both defected.
  _drawChart(svg, theme) {
    const { filled } = this.results;
    const parts = [
      { key: 'mutual', label: 'оба сотрудничали', color: theme.accent },
      { key: 'exploited', label: 'одного предали', color: theme.gold },
      { key: 'defect', label: 'оба предали', color: theme.red },
    ];
    drawStackedBars(svg, {
      legend: parts,
      rows: [1, 2].map((round) => {
        const o = dilemmaOutcomes(filled, round);
        return {
          label: `Раунд ${round}`,
          segments: parts.map((p) => ({
            key: p.key,
            value: o[p.key],
            color: p.color,
            tip: tipHtml(`Раунд ${round}`, [[p.label, `${o[p.key]} из ${o.total} пар`]]),
          })),
        };
      }),
      theme,
    });
  }

  _showResults() {
    this.results = prisonersDilemmaResults(this.entries);
    const { filled } = this.results;

    ReportExport.register(
      'prisoners-dilemma',
      {
        subtitle: 'Рационально предать — но если встреча не последняя, правила меняются.',
        meta: ReportExport.meta(filled.length * 2, `${filled.length} пар · 2 раунда`),
        explanation:
          'Рационально для каждого — предать, но если предадут оба, обоим будет хуже, чем при обоюдном сотрудничестве. Игру сформулировали Меррилл Флуд и Мелвин Дрешер в 1950 году в RAND Corporation; в компьютерных турнирах Роберта Аксельрода в начале 1980-х для повторяющейся версии игры победила простая отзывчивая стратегия «Око за око».',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.assignment = Roles.makePairs(state.participants);
    this.selectedSwap = null;
    this.entries = buildDilemmaEntries(this.assignment);
    this.results = null;
    Persist.clear('prisoners-dilemma');
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  _pairCard(p, i) {
    const selectedA = this.selectedSwap?.i === i && this.selectedSwap?.side === 'a';
    const selectedB = this.selectedSwap?.i === i && this.selectedSwap?.side === 'b';
    return html`
      <div class="role-pair-card ${p.trio ? 'role-pair-trio' : ''}">
        ${p.trio ? html`<span class="role-pair-trio-badge">${unsafeHTML(ICON_TRIO)} трио</span>` : ''}
        <div class="role-pair-side left">
          <button
            type="button"
            class="role-pair-name ${selectedA ? 'swap-selected' : ''}"
            @click=${() => this._onSwapClick(i, 'a')}
          >
            ${unsafeHTML(avatarName(p.a))}
          </button>
        </div>
        <div class="role-pair-vs">↔</div>
        <div class="role-pair-side right">
          <button
            type="button"
            class="role-pair-name ${selectedB ? 'swap-selected' : ''}"
            @click=${() => this._onSwapClick(i, 'b')}
          >
            ${unsafeHTML(avatarName(p.b))}
          </button>
        </div>
      </div>
    `;
  }

  _pairsHolder() {
    const { pairs, observer, trio } = this.assignment;
    return html`
      <div class="role-pairs">${pairs.map((p, i) => this._pairCard(p, i))}</div>
      <p class="note swap-hint">Нажмите на двух участников по очереди, чтобы поменять их местами.</p>
      ${
        trio
          ? html`<div class="info-tip">
            <span
              >Нечётное число участников — ${trio.join(', ')} играют трио по кругу вместо пары:
              каждый сыграет дважды, с двумя разными партнёрами, но зато без исключений.</span
            >
          </div>`
          : observer
            ? html`<div class="info-tip">
              <span
                >${observer} — нечётное число участников, в этом раунде наблюдатель: ведёт
                протокол или подыгрывает за отсутствующего.</span
              >
            </div>`
            : ''
      }
    `;
  }

  _entryCard(e, idx, round) {
    const fieldA = round === 1 ? 'r1a' : 'r2a';
    const fieldB = round === 1 ? 'r1b' : 'r2b';
    return html`
      <div class="pair-entry-card wide ${e.trio ? 'role-pair-trio' : ''}">
        ${e.trio ? html`<span class="role-pair-trio-badge">${unsafeHTML(ICON_TRIO)} трио</span>` : ''}
        <div class="pair-entry-name"><b>${unsafeHTML(avatarName(e.a))}</b></div>
        <div class="toggle-pair">
          <button
            type="button"
            data-val="C"
            class="${e[fieldA] === 'C' ? 'on' : ''}"
            @click=${() => this._onToggle(idx, 'a', round, 'C')}
          >
            Coтр.
          </button>
          <button
            type="button"
            data-val="D"
            class="${e[fieldA] === 'D' ? 'on' : ''}"
            @click=${() => this._onToggle(idx, 'a', round, 'D')}
          >
            Пред.
          </button>
        </div>
        <div class="pair-entry-connector">↔</div>
        <div class="toggle-pair">
          <button
            type="button"
            data-val="C"
            class="${e[fieldB] === 'C' ? 'on' : ''}"
            @click=${() => this._onToggle(idx, 'b', round, 'C')}
          >
            Coтр.
          </button>
          <button
            type="button"
            data-val="D"
            class="${e[fieldB] === 'D' ? 'on' : ''}"
            @click=${() => this._onToggle(idx, 'b', round, 'D')}
          >
            Пред.
          </button>
        </div>
        <div class="pair-entry-name"><b>${unsafeHTML(avatarName(e.b))}</b></div>
      </div>
    `;
  }

  render() {
    const filled1 = this._filledCount(1);
    const filled2 = this._filledCount(2);
    const r = this.results;
    const recapFilled = this.entries.filter((e) => e.r1a !== null && e.r1b !== null);

    return html`
      <div class="wrap-wide" style=${gameAccentStyle('prisoners-dilemma')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
          <p class="eyebrow">Командное упражнение · 10 минут</p>
          <h1>Один партнёр, два хода</h1>
          <p class="lede">
            Мы разобьём вас на пары. Каждая пара сыграет два раунда подряд с одним и тем же
            партнёром — и после первого раунда узнает, что выбрал другой.
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
            <button class="primary" @click=${() => this.flow.advance(1)}>Распределить пары ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(0)}
        </section>

        <section class="${this.flow.roundClass(1)}" id="round-1">
          <div class="round-body">
          <p class="eyebrow">Распределение ролей</p>
          <h2>Кто с кем в паре</h2>
          <p class="lede">
            Роли симметричны, и пара останется той же на оба раунда. Не нравится расклад —
            перемешайте.
          </p>

          <div>${this._pairsHolder()}</div>
          <button
            class="shuffle-btn ${this.shuffleSpin ? 'spin' : ''}"
            @click=${() => this._onShuffle()}
          >
            ${unsafeHTML(ICON_SHUFFLE)} Перемешать пары
          </button>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this._lockPairs()}>Дальше ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(1)}
        </section>

        <section class="${this.flow.roundClass(2)}" id="round-2">
          <div class="round-body">
          <p class="eyebrow">Раунд 1 из 2 · Вслепую</p>
          <h2>Впишите ход каждого в паре</h2>
          <p class="lede">
            Что выбрал каждый — сотрудничать или предать. Партнёры не знают выбора друг друга.
          </p>

          <div class="pair-entry-list" id="entry-body-1">
            ${this.entries.map((e, i) => this._entryCard(e, i, 1))}
          </div>

          <div class="fill-progress">
            Заполнено пар: <span>${filled1}</span> из <span>${this.entries.length}</span>
            <div class="track">
              <div style="width:${(filled1 / this.entries.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              id="next-btn-1"
              ?disabled=${!hasEnough(filled1, MIN_FILLED_PAIRS)}
              @click=${() => this._showRecap()}
            >
              Что получилось в раунде 1 ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(2)}
        </section>

        <section class="${this.flow.roundClass(3)}" id="round-3">
          <div class="round-body">
          <p class="eyebrow">Итог раунда 1</p>
          <h2>Вот что выбрала каждая пара</h2>
          <p class="lede">Прочитайте вслух — теперь каждый знает, что сделал его партнёр в первый раз.</p>

          <table class="results-table" id="recap-table">
            <thead>
              <tr>
                <th>Пара</th>
                <th>Ходы</th>
                <th>Баллы</th>
              </tr>
            </thead>
            <tbody id="recap-tbody">
              ${recapFilled.map((e) => {
                const pts = prisonersDilemmaPayoff(e.r1a, e.r1b);
                return html`
                  <tr>
                    <td class="name">${unsafeHTML(avatarName(e.a))} ↔ ${unsafeHTML(avatarName(e.b))}</td>
                    <td>${choiceLabel(e.r1a)} / ${choiceLabel(e.r1b)}</td>
                    <td>${pts[0]} / ${pts[1]}</td>
                  </tr>
                `;
              })}
            </tbody>
          </table>

          <p class="note">Раунд 2 — с тем же партнёром. Решайте заново, уже зная, как он повёл себя в первый раз.</p>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(2)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.flow.advance(4)}>Раунд 2 ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(3)}
        </section>

        <section class="${this.flow.roundClass(4)}" id="round-4">
          <div class="round-body">
          <p class="eyebrow">Раунд 2 из 2 · Уже зная итог раунда 1</p>
          <h2>Тот же партнёр — решайте заново</h2>
          <p class="lede">Что выбрал каждый теперь, зная, как повёл себя партнёр в первый раз.</p>

          <div class="pair-entry-list" id="entry-body-2">
            ${this.entries.map((e, i) => this._entryCard(e, i, 2))}
          </div>

          <div class="fill-progress">
            Заполнено пар: <span>${filled2}</span> из <span>${this.entries.length}</span>
            <div class="track">
              <div style="width:${(filled2 / this.entries.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(3)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              id="next-btn-2"
              ?disabled=${!hasEnough(filled2, MIN_FILLED_PAIRS)}
              @click=${() => this.flow.advance(5, () => this._showResults())}
            >
              Показать результаты ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(4)}
        </section>

        <section class="${this.flow.roundClass(5)}" id="round-5">
          <div class="round-body">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>

          ${renderReveal({ value: r ? `${(r.delta >= 0 ? '+' : '') + r.delta} п.п.` : '—', ...REVEAL_COPY.prisonersDilemma(r ? { coopR1: r.coopR1, coopR2: r.coopR2, delta: r.delta, echoRate: r.echoRate } : null) })}

          <div class="group-compare">
            <div class="g low">
              <div class="t">Раунд 1 · доля сотрудничества</div>
              <div class="v">${r ? `${r.coopR1}%` : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Раунд 2 · доля сотрудничества</div>
              <div class="v">${r ? `${r.coopR2}%` : '—'}</div>
            </div>
          </div>

          <div class="stat-row">
            <div class="stat">
              <div class="n">${r ? `${r.echoRate}%` : '—'}</div>
              <div class="lab">ходов во втором раунде повторили ход партнёра в первом («как эхо»)</div>
            </div>
            <div class="stat">
              <div class="n">${r ? `${r.ccCount} из ${r.filled.length}` : '—'}</div>
              <div class="lab">пар с обоюдным сотрудничеством хотя бы в одном раунде</div>
            </div>
          </div>

          <div class="d3-chart-card">
            <div class="d3-chart-title">Что делали пары в каждом раунде</div>
            <svg id="pd-chart" class="d3-chart-svg" role="img" aria-label="Сколько пар сотрудничали, сколько обманули и сколько предали друг друга в раундах 1 и 2"></svg>
            <p class="d3-chart-cap">Каждый ряд — все пары в раунде. Если зелёного стало меньше, а красного больше — «тень будущего» не сработала.</p>
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Раунд</th>
                <th>Пара</th>
                <th>Ходы</th>
                <th>Баллы</th>
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? prisonersDilemmaRoundRows(r.filled).map(
                      (row) => html`
                      <tr>
                        <td>${row.round}</td>
                        <td class="name">${unsafeHTML(avatarName(row.a))} ↔ ${unsafeHTML(avatarName(row.b))}</td>
                        <td>${choiceLabel(row.choiceA)} / ${choiceLabel(row.choiceB)}</td>
                        <td>${row.pointsA} / ${row.pointsB}</td>
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
            <button class="ghost" @click=${() => this.flow.scrollTo(4)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.flow.advance(6)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(5)}
        </section>

        <section class="${this.flow.roundClass(6)}" id="round-6">
          <div class="round-body">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Дилемма заключённого</h1>
          ${renderContext(CONTENT.context)}

          <hr />
          <h2>Ещё немного фактов</h2>

          ${renderFacts(CONTENT.facts)}

          <div class="nav-row">
            <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
            <span></span>
          </div>
          </div>
          ${this.flow.lock(6)}
        </section>
          </div>

          <aside class="game-rail">
            <div class="game-rail-title">Дилемма заключённого</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'prisoners-dilemma',
              stepLabels: ROUND_TITLES,
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-prisoners-dilemma', RetroGamePrisonersDilemma);
