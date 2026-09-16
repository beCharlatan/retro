/* =========================================================
   GAME: Мудрость толпы (crowd-wisdom)
   Three independent estimation questions instead of one — same
   "does the crowd's average beat most individuals" mechanic, but
   pooled across 3× the guesses for a bigger, more convincing
   sample. All three are read aloud and answered together in ONE
   entry round (unlike calibration.js's one-round-per-question
   layout) — nothing here depends on hearing one question's
   answer before the next, so there's no reason to split them
   across separate screens; the facilitator just reads three
   questions back to back and everyone fills in three numbers.

   Defaults to three classic estimation questions, but the
   facilitator can swap in up to three of their own
   facts-with-a-known-answer — same "leave a slot blank to keep
   its default" custom-question pattern as calibration.js's
   3-question panel, generalized from that game's per-question
   rounds to this one's single shared round.

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3).
   Note on test selectors: unlike dictator/public-goods/anchoring,
   this game keeps its original plain `id`s (custom-q-*-N,
   entry-body, ...) instead of switching to data-testid — a Shadow
   DOM component's ids live in their own namespace (no collision
   risk with other components any more), and Playwright's CSS
   engine pierces open shadow roots for id selectors exactly like
   it does for data-testid ones.
========================================================= */
import * as d3 from 'd3';
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ChartTip } from '../chart-tip.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { clearQuestionSlots, readQuestionSlots } from '../custom-question-form.js';
import { confirmExit, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import {
  ICON_CLIPBOARD,
  ICON_DOWNLOAD,
  ICON_EDIT,
  ICON_LEFT,
  ICON_RIGHT,
  ICON_X,
} from '../icons.js';
import { stackLanes, swarmHeight, valueDomain } from '../logic/chart-layout.js';
import {
  buildCustomQuestions,
  cloneQuestions,
  formatValue,
  MESSAGES,
} from '../logic/custom-questions.js';
import {
  countFilled,
  hasEnough,
  loadableDraft,
  minCount,
  parseNumberInput,
  patchItem,
} from '../logic/entries.js';
import { crowdWisdomResults } from '../logic/results.js';
import { dodge } from '../logic/stats.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const DEFAULT_QUESTIONS = [
  { q: 'Сколько тонн весит Международная космическая станция?', answer: 420, unit: ' т' },
  { q: 'Сколько костей в скелете взрослого человека?', answer: 206, unit: '' },
  { q: 'Какова длина экватора Земли, в километрах?', answer: 40075, unit: ' км' },
];
const TOTAL_SCREENS = 4;
const ROUND_TITLES = [
  'Проверим, кто точнее — один человек или вся команда',
  'Впишите оценку каждого участника',
  'Что получилось у вашей команды',
  'Мудрость толпы',
];

export class RetroGameCrowdWisdom extends LitElement {
  static styles = sharedStyles;

  static properties = {
    data: { state: true },
    draft: { state: true },
    results: { state: true },
    questions: { state: true },
    isCustomQuestions: { state: true },
    customPanelOpen: { state: true },
    customQStatus: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.questions = cloneQuestions(DEFAULT_QUESTIONS);
    this.data = this._blankData();
    this.results = null;
    this.isCustomQuestions = false;
    this.customPanelOpen = false;
    this.customQStatus = '';

    this.draft = loadableDraft(Persist.load('crowd-wisdom'), {
      key: 'data',
      length: this.names.length,
    });
  }

  _blankData() {
    return this.names.map((n) => ({ name: n, guesses: this.questions.map(() => null) }));
  }

  _restoreDraft() {
    this.flow.advance(1, () => {
      this.data = this.draft.payload.data;
      if (this.draft.payload.questions) {
        this.questions = this.draft.payload.questions;
        this.isCustomQuestions = true;
      }
      this.draft = null;
    });
  }

  _discardDraft() {
    Persist.clear('crowd-wisdom');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('crowd-wisdom');
    renderHome();
  }

  _toggleCustomPanel() {
    this.customPanelOpen = !this.customPanelOpen;
  }

  _customQuestionBlock(def, i) {
    return html`
      <div class="custom-q-block">
        <div class="custom-q-block-title">
          Вопрос ${i + 1}
          <span class="custom-q-default-hint">по умолчанию: «${def.q}», ответ ${def.answer}${def.unit}</span>
        </div>
        <div class="custom-q-field">
          <label for="custom-q-text-${i}">Текст вопроса</label>
          <input type="text" id="custom-q-text-${i}" placeholder="${def.q}" />
        </div>
        <div class="custom-q-row">
          <div class="custom-q-field">
            <label for="custom-q-answer-${i}">Правильный ответ</label>
            <input type="number" id="custom-q-answer-${i}" placeholder="напр. ${def.answer}" />
          </div>
          <div class="custom-q-field">
            <label for="custom-q-unit-${i}">Единица (необязательно)</label>
            <input type="text" id="custom-q-unit-${i}" placeholder="напр. ${def.unit.trim() || 'штук'}" />
          </div>
        </div>
      </div>
    `;
  }

  _applyCustomQuestions() {
    const result = buildCustomQuestions(
      DEFAULT_QUESTIONS,
      readQuestionSlots(this.renderRoot, DEFAULT_QUESTIONS.length),
    );
    if (!result.ok) {
      this.customQStatus = result.error;
      return;
    }
    this.questions = result.questions;
    this.isCustomQuestions = result.isCustom;
    this.customQStatus = result.message;
  }

  _resetCustomQuestions() {
    this.questions = cloneQuestions(DEFAULT_QUESTIONS);
    this.isCustomQuestions = false;
    this.customQStatus = MESSAGES.resetAll;
    clearQuestionSlots(this.renderRoot, DEFAULT_QUESTIONS.length);
  }

  _onEntryInput(e, idx, qIdx) {
    this.data = patchItem(
      this.data,
      idx,
      'guesses',
      qIdx,
      parseNumberInput(e.target.value, { min: 0 }),
    );
    Persist.save('crowd-wisdom', {
      data: this.data,
      questions: this.isCustomQuestions ? this.questions : null,
    });
  }

  _filledCountFor(qIdx) {
    return countFilled(this.data, (d) => d.guesses[qIdx] !== null);
  }

  // Gates "Показать результаты" on the WORST-covered question, not the
  // total — a question with only 1 answer can't produce a meaningful
  // average for itself, no matter how well-answered the other two are.
  _minFilledCount() {
    return minCount(this.questions.map((_, qi) => this._filledCountFor(qi)));
  }

  _totalFilledCount() {
    return this.data.reduce((sum, d) => sum + d.guesses.filter((g) => g !== null).length, 0);
  }

  _showResults() {
    const answersReveal =
      'Правильные ответы: ' +
      this.questions.map((q, i) => `(${i + 1}) ${formatValue(q.answer, q.unit)}`).join(' · ');
    this.results = { ...crowdWisdomResults(this.data, this.questions), answersReveal };
    const { totalAnswered } = this.results;

    ReportExport.register(
      'crowd-wisdom',
      {
        subtitle: this.isCustomQuestions
          ? 'Три вопроса, у каждого — независимая оценка от всей команды.'
          : 'Средняя оценка группы обходит по точности почти всех поодиночке — сразу на трёх вопросах.',
        meta: ReportExport.meta(this.names.length, `${totalAnswered} оценок · 3 вопроса`),
        explanation:
          'У каждого человека своя случайная ошибка в оценке, но при независимом усреднении эти ошибки частично гасят друг друга. Явление описал Фрэнсис Гальтон в 1907 году: медиана 787 независимых оценок веса быка на деревенской ярмарке разошлась с реальным весом всего на 9 фунтов — точнее большинства профессиональных скотоводов. Три вопроса вместо одного дают тот же эффект на втрое большей выборке.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear('crowd-wisdom');
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  updated() {
    // No longer gated on screenIdx===2 — every round (including this
    // one) is always in the DOM now, so "do we have results yet" is
    // the only thing that matters for whether the chart should draw.
    if (this.results) {
      this._drawChart(this.results.perQuestion);
    }
  }

  // Three independent lanes, one per question — each with its OWN
  // x-scale, own beeswarm, own true-value/average lines. Plotting all
  // three questions on one shared axis wouldn't mean anything (tons vs.
  // a bone count vs. kilometers); this is really three small
  // self-contained charts stacked in one card, not one chart with
  // three series, and each lane's height comes from its own swarm (see
  // crowd-wisdom's original single-question version for why a fixed
  // height wastes space in the exported report).
  _drawChart(perQuestion) {
    const svg = this.renderRoot.getElementById('cw-chart');
    if (!svg) return;
    svg.innerHTML = '';
    const active = perQuestion.filter((pq) => pq.filled.length > 0);
    if (!active.length) return;

    const cs = getComputedStyle(this.renderRoot.querySelector('.wrap-wide'));
    const accent = cs.getPropertyValue('--game-accent').trim() || '#4E7FFF';
    const accentDeep = cs.getPropertyValue('--game-accent-deep').trim() || accent;
    const gold = cs.getPropertyValue('--gold').trim() || '#b87503';

    const W = 640,
      ML = 20,
      MR = 20,
      MT = 40,
      MB = 30,
      laneGap = 26,
      dotR = 6;
    const plotW = W - ML - MR;

    function ns(tag, attrs) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }

    const lanes = active.map((pq) => {
      const guesses = pq.filled.map((d) => d.guess);
      const [minV, maxV] = valueDomain(guesses.concat([pq.question.answer]));
      const x = d3
        .scaleLinear()
        .domain([minV, maxV])
        .range([ML, ML + plotW]);
      const swarm = dodge(pq.filled, (d) => x(d.guess), dotR + 1.5);
      return { pq, x, swarm, contentH: swarmHeight(swarm, dotR) };
    });

    // Each lane: MT above its content, MB below its axis, laneGap to the next.
    const { baselines, height: H } = stackLanes(
      lanes.map((lane) => lane.contentH),
      { firstTop: MT, gap: MT + MB + laneGap, bottom: MB },
    );
    const laneLayout = lanes.map((lane, i) => ({
      ...lane,
      baseline: baselines[i],
      top: baselines[i] - lane.contentH - MT,
    }));

    const svgSel = d3
      .select(svg)
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    laneLayout.forEach((lane, qi) => {
      const { pq, x, swarm, top, baseline } = lane;

      svgSel
        .append('rect')
        .attr('x', 0)
        .attr('y', top)
        .attr('width', W)
        .attr('height', baseline - top + MB - 8)
        .attr('rx', 14)
        .style('fill', `color-mix(in srgb, ${accent} 6%, white)`);

      const label = pq.question.q.length > 60 ? `${pq.question.q.slice(0, 57)}…` : pq.question.q;
      svgSel
        .append('text')
        .attr('x', 12)
        .attr('y', top + 16)
        .style('font-size', '12px')
        .style('font-weight', 700)
        .style('fill', accentDeep)
        .text(`Вопрос ${qi + 1} · ${label}`);

      const trueX = x(pq.question.answer);
      svgSel
        .append('line')
        .attr('x1', trueX)
        .attr('y1', top + 24)
        .attr('x2', trueX)
        .attr('y2', baseline)
        .style('stroke', gold)
        .style('stroke-width', 1.5)
        .style('stroke-dasharray', '5,4');

      const avgX = x(pq.avg);
      svgSel
        .append('line')
        .attr('x1', avgX)
        .attr('y1', top + 24)
        .attr('x2', avgX)
        .attr('y2', baseline)
        .style('stroke', accentDeep)
        .style('stroke-width', 1.5);

      svgSel
        .append('line')
        .attr('x1', ML)
        .attr('y1', baseline)
        .attr('x2', ML + plotW)
        .attr('y2', baseline)
        .style('stroke', 'var(--ink)')
        .style('stroke-width', 1.2);

      x.ticks(4).forEach((v) => {
        const tx = x(v);
        svgSel
          .append('line')
          .attr('x1', tx)
          .attr('y1', baseline)
          .attr('x2', tx)
          .attr('y2', baseline + 5)
          .style('stroke', 'var(--ink-faint)');
        svgSel
          .append('text')
          .attr('x', tx)
          .attr('y', baseline + 17)
          .attr('text-anchor', 'middle')
          .style('font-size', '10px')
          .style('fill', 'var(--ink-faint)')
          .text(Math.round(v));
      });

      const points = swarm.map((s) => ({ ...s.data, cx: s.x, cy: baseline - dotR - 2 - s.y }));

      const dots = svgSel
        .selectAll(null)
        .data(points)
        .join('circle')
        .attr('class', 'answer-dot')
        .attr('cx', (d) => d.cx)
        .attr('cy', (d) => d.cy)
        .attr('r', 0)
        .style('fill', accent)
        .style('fill-opacity', 0.88)
        .style('stroke', 'var(--white)')
        .style('stroke-width', 1.3);

      dots
        .transition()
        .delay((_, i) => i * 22)
        .duration(400)
        .ease(d3.easeBackOut.overshoot(1.7))
        .attr('r', dotR);

      // Hit circle inserted right after its own dot — keeps the DOM a
      // plain [visible, hit, visible, hit, ...] sequence per lane.
      const dotNodes = dots.nodes();
      points.forEach((p, i) => {
        const hit = ns('circle', {
          cx: p.cx,
          cy: p.cy,
          r: dotR + 5,
          fill: 'transparent',
          'pointer-events': 'all',
        });
        dotNodes[i].after(hit);
        ChartTip.attach(
          hit,
          () =>
            `<b>${p.name}</b><span class="tip-row"><span>Вопрос ${qi + 1}</span><span>${formatValue(p.guess, pq.question.unit)}</span></span>`,
        );
        hit.addEventListener('mouseenter', () => {
          d3.select(dotNodes[i])
            .style('fill-opacity', 1)
            .attr('r', dotR * 1.2);
        });
        hit.addEventListener('mouseleave', () => {
          d3.select(dotNodes[i]).style('fill-opacity', 0.88).attr('r', dotR);
        });
      });
    });
  }

  _entryRow(row, idx) {
    return html`
      <div class="entry-row three-col">
        <div class="name">${unsafeHTML(avatarName(row.name))}</div>
        ${this.questions.map(
          (_, qi) => html`
            <input
              type="number"
              min="0"
              inputmode="numeric"
              placeholder="напр. 300"
              .value=${row.guesses[qi] ?? ''}
              @input=${(e) => this._onEntryInput(e, idx, qi)}
            />
          `,
        )}
      </div>
    `;
  }

  render() {
    const totalFilled = this._totalFilledCount();
    const totalSlots = this.names.length * this.questions.length;
    const r = this.results;

    return html`
      <div class="wrap-wide" style=${gameAccentStyle('crowd-wisdom')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
          <p class="eyebrow">Командное упражнение · 5 минут</p>
          <h1>Проверим, кто точнее — один человек или вся команда</h1>
          <p class="lede">Три коротких вопроса. Не гуглите — это оценка «на глаз», в этом весь смысл.</p>

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
                <b>Задайте три вопроса вслух — один за другим</b>
                <span>После каждого вопроса пусть все молча думают над своей оценкой, не советуясь с соседями.</span>
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Каждый называет число для каждого вопроса</b>
                <span
                  >Любое число, даже если совсем не уверены — гадать можно и нужно. Дальше вносим
                  все три оценки сюда.</span
                >
              </div>
            </li>
          </ol>

          <ol class="question-list">
            ${this.questions.map(
              (q, i) => html`
                <li class="question-list-item">
                  <span class="question-list-num">${i + 1}</span>
                  <span id="cw-question-text-${i}">«${q.q}»</span>
                </li>
              `,
            )}
          </ol>

          <p class="note">
            Важно: оценки должны быть независимыми — если кто-то услышит чужое число раньше
            своего, эффект не сработает.
          </p>

          <div class="custom-q-toggle-row">
            <button type="button" class="secondary" id="custom-q-toggle" @click=${() => this._toggleCustomPanel()}>
              ${unsafeHTML(ICON_EDIT)} Задать свои вопросы вместо стандартных
            </button>
          </div>
          <div class="custom-q-panel" id="custom-q-panel" ?hidden=${!this.customPanelOpen}>
            <p class="note" style="margin:0 0 14px;">
              Можно заменить любой из трёх вопросов — оставьте поле пустым, чтобы оставить
              стандартный.
            </p>
            ${DEFAULT_QUESTIONS.map((def, i) => this._customQuestionBlock(def, i))}
            <div class="custom-q-actions">
              <button type="button" class="primary" id="custom-q-apply" @click=${() => this._applyCustomQuestions()}>
                Применить
              </button>
              <button
                type="button"
                class="secondary"
                id="custom-q-reset"
                ?hidden=${!this.isCustomQuestions}
                @click=${() => this._resetCustomQuestions()}
              >
                ↺ Вернуть все стандартные
              </button>
            </div>
            <p class="note" id="custom-q-status">${this.customQStatus}</p>
          </div>

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
          <h2>Впишите оценку каждого участника</h2>
          <p class="lede">Целым числом на каждый из трёх вопросов — не страшно, если совсем «на глаз».</p>

          <div class="entry-head three-col">
            <div>Участник</div>
            ${this.questions.map((_, i) => html`<div>Вопрос ${i + 1}</div>`)}
          </div>
          <div id="entry-body">${this.data.map((row, i) => this._entryRow(row, i))}</div>

          <div class="fill-progress">
            Заполнено: <span>${totalFilled}</span> из <span>${totalSlots}</span>
            <div class="track">
              <div style="width:${(totalFilled / totalSlots) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button
              class="primary"
              ?disabled=${!hasEnough(this._minFilledCount())}
              @click=${() => this.flow.advance(2, () => this._showResults())}
            >
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

          ${renderReveal({ value: r && r.hitRate !== null ? `${r.hitRate}%` : '—', valueId: 'hit-rate-display', ...REVEAL_COPY.crowdWisdom(r ? { pct: r.hitRate, worse: r.totalWorseThanAvg, total: r.totalAnswered } : null) })}

          <p class="note" id="answers-reveal">${r ? r.answersReveal : ''}</p>

          <div class="stat-row">
            ${
              r
                ? r.perQuestion.map(
                    (pq, qi) => html`
                    <div class="stat">
                      <div class="n">${pq.avg !== null ? formatValue(pq.avg, pq.question.unit) : '—'}</div>
                      <div class="lab">
                        среднее по вопросу ${qi + 1} · ошибка ±${pq.avgErr !== null ? Math.round(pq.avgErr) : '—'}
                      </div>
                    </div>
                  `,
                  )
                : ''
            }
          </div>

          <div class="chart-wrap">
            <svg id="cw-chart" class="d3-chart-svg" viewBox="0 0 640 260"></svg>
            <div class="cap">
              Каждая точка — оценка одного человека на один вопрос. Пунктир — правильный ответ,
              сплошная линия — среднее команды. Три отдельные шкалы — у каждого вопроса свой
              масштаб.
            </div>
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                ${this.questions.map((_, i) => html`<th>Вопрос ${i + 1}</th>`)}
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? this.data.map(
                      (d) => html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                        ${this.questions.map(
                          (q, qi) =>
                            html`<td>${d.guesses[qi] !== null ? formatValue(d.guesses[qi], q.unit) : '—'}</td>`,
                        )}
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
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Мудрость толпы</h1>
          <p class="lede">
            Один человек почти всегда ошибается заметно. Но среднее по всей группе часто
            оказывается на удивление точным.
          </p>

          <p>
            В 1907 году английский учёный Фрэнсис Гальтон оказался на деревенской ярмарке в
            Плимуте, где проходил конкурс: посетители на глаз оценивали вес быка, купив билет со
            своей догадкой. Гальтон, не веривший в способности «толпы» здраво судить о числах,
            собрал и проанализировал все 787 записок после конкурса.
          </p>

          <div class="stat-row">
            <div class="stat">
              <div class="n">1197</div>
              <div class="lab">фунтов — реальный вес быка</div>
            </div>
            <div class="stat">
              <div class="n">1207</div>
              <div class="lab">фунтов — медиана всех 787 оценок</div>
            </div>
          </div>

          <p>
            Медиана толпы разошлась с реальным весом всего на 9 фунтов из ~1200 — точнее, чем
            оценки большинства профессиональных скотоводов и мясников, участвовавших в том же
            конкурсе. Гальтон, ожидавший обратного, опубликовал результат в журнале <i>Nature</i>
            под названием «Vox Populi» («Глас народа»). Идею позже популяризировал журналист Джеймс
            Шуровьецки в книге «The Wisdom of Crowds» (2004).
          </p>

          <p>
            <b>Почему это работает.</b> У каждого отдельного человека есть своя случайная ошибка —
            кто-то оценивает с запасом, кто-то занижает, у кого-то просто нет опыта в этой
            конкретной вещи. Если ошибки разных людей действительно случайны и не связаны друг с
            другом, то при усреднении они частично гасят друг друга: завышенные и заниженные
            оценки компенсируются, а остаётся общий, более устойчивый сигнал. Три независимых
            вопроса вместо одного дают втрое больше таких независимых точек данных — и втрое
            увереннее подтверждают эффект, а не один случайный удачный (или неудачный) результат.
          </p>

          <hr />
          <h2>Ещё немного фактов</h2>

          <div class="fact">
            <b>Работает только при независимости оценок</b
            ><span
              >Если участники слышат чужие числа до того, как назвать своё, — эффект резко
              слабеет: группа начинает «сбиваться в стаю» вокруг первого прозвучавшего числа
              (привет, эффект якоря).</span
            >
          </div>
          <div class="fact">
            <b>На этом принципе построены рынки прогнозов</b
            ><span
              >Агрегаторы вроде Metaculus или биржи предсказаний собирают независимые оценки тысяч
              людей — усреднённый прогноз систематически обгоняет по точности большинство
              отдельных экспертов.</span
            >
          </div>
          <div class="fact">
            <b>Толпа хороша в оценке количества, но не в решениях</b
            ><span
              >Эффект отлично работает для числовых оценок (вес, число предметов, сроки), но плохо
              переносится на групповые решения под давлением — там, наоборот, включается
              конформность (см. эксперименты Аша).</span
            >
          </div>
          <div class="fact">
            <b>NASA и разлив нефти</b
            ><span
              >В 2010 году во время утечки нефти в Мексиканском заливе для оценки скорости разлива
              привлекали независимые расчёты множества специалистов из разных областей —
              усреднённая оценка оказалась куда надёжнее, чем любая одна экспертная модель.</span
            >
          </div>
          <div class="fact">
            <b>Чем разнообразнее толпа, тем лучше прогноз</b
            ><span
              >Исследования показывают, что группа из людей с разным опытом и точками зрения в
              среднем даёт более точный коллективный прогноз, чем группа узких специалистов одного
              профиля — разнообразие ошибок важнее среднего уровня экспертизы.</span
            >
          </div>
          <div class="fact">
            <b>Рабочая параллель</b
            ><span
              >Если перед планированием спринта каждый разработчик независимо оценивает объём
              задачи, а затем оценки усредняются — итоговая цифра обычно надёжнее, чем если один
              голос («самый громкий» или «самый опытный») сразу задаёт тон всей дискуссии.</span
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
            <div class="game-rail-title">Мудрость толпы</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'crowd-wisdom',
              stepLabels: ROUND_TITLES,
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-crowd-wisdom', RetroGameCrowdWisdom);
