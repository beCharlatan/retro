/* =========================================================
   GAME: Игра диктатора (dictator)
   Two rounds instead of one: round 1 is fully anonymous (as
   before), round 2 tells people their name will be attached
   to the decision — directly testing the "observability
   changes generosity" finding instead of just describing it
   in the facts afterwards. Same pool of people both times, no
   pairing needed — this is the simplest game to extend with a
   second data point per person.

   ---------------------------------------------------------
   PILOT for the Lit/Shadow DOM migration (see
   docs/modernization-plan.md Phase 2) — the first game rewritten
   as a real Web Component instead of an `app.innerHTML = \`...\`
   string template + document.getElementById wiring. Notable
   departures from the other 12 (still-legacy) games, now that
   rendering is declarative and DOM-scoped to this element's own
   shadow root instead of the global `document`:

   - Screens are all rendered at once; which one is visible is a
     `screenIdx` reactive property (`.active` class computed per
     `<section>` in the template) — no Screen.goTo() DOM toggling.
   - The draft-restore banner is rendered declaratively from `this.draft`
     instead of Persist.banner()'s imperative
     `document.getElementById(mountId).innerHTML = ...` (which can't see
     into a shadow root anyway) — `timeAgo` is imported standalone from
     persist.js for that. Persist.save/load/clear (pure sessionStorage,
     no DOM) are unchanged.
   - The export button (ReportExport.download) uses a real `@click`
     binding, and ReportExport.register(..., this.renderRoot) gets the
     shadow root so it can find the results screen inside it.
   - The SVG chart is still hand-built imperatively (ChartTip's hover
     wiring doesn't lend itself to a declarative rewrite) — just scoped
     to `this.renderRoot` instead of `document`.
   - The whole app design system (src/styles.css) is included via
     `sharedStyles` — see src/styles/shared-styles.js for why the whole
     file rather than a hand-picked subset.
========================================================= */

import * as d3 from 'd3';
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ChartTip } from '../chart-tip.js';
import CONTENT from '../content/dictator.json';
import { renderContext, renderFacts, renderNote, renderSteps } from '../content.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { confirmExit, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_DOWNLOAD, ICON_LEFT, ICON_RIGHT, ICON_X } from '../icons.js';
import { stackLanes, swarmHeight } from '../logic/chart-layout.js';
import {
  countFilled,
  hasEnough,
  hasFields,
  loadableDraft,
  parseNumberInput,
  patchRow,
} from '../logic/entries.js';
import { formatSigned } from '../logic/format.js';
import { dictatorResults } from '../logic/results.js';
import { dodge } from '../logic/stats.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const POT = 1000;
const VARS = { pot: POT }; // filled into {pot} in the content texts
const TOTAL_SCREENS = 5;
const ROUND_TITLES = [
  'Быстрое решение про деньги — дважды',
  'Сколько каждый отдал — не зная, что решат остальные',
  'То же решение, но уже не анонимно',
  'Что получилось у вашей команды',
  'Игра диктатора',
];

export class RetroGameDictator extends LitElement {
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

    this.draft = loadableDraft(Persist.load('dictator'), {
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
    Persist.clear('dictator');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('dictator');
    renderHome();
  }

  _onEntryInput(e, idx, field) {
    this.data = patchRow(this.data, idx, {
      [field]: parseNumberInput(e.target.value, { min: 0, max: POT }),
    });
    Persist.save('dictator', { data: this.data });
  }

  _filledCount(field) {
    return countFilled(this.data, hasFields(field));
  }

  _showResults() {
    this.results = dictatorResults(this.data);
    const { filled } = this.results;

    ReportExport.register(
      'dictator',
      {
        subtitle:
          'Никто не заставляет делиться — но почти все делятся, и ещё больше, если их видят.',
        meta: ReportExport.meta(filled.length, '2 раунда'),
        explanation:
          'Классическая экономическая теория предсказывает, что рациональный и эгоистичный человек отдаст 0 — в реальности почти никто так не делает, а стоит убрать анонимность, отдают ещё больше. Дизайн формализован в статье Forsythe, Horowitz, Savin, Sefton (1994) как «очищенный» от переговорной стратегии тест альтруизма.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.data = this._blankData();
    this.results = null;
    Persist.clear('dictator');
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  updated() {
    // No longer gated on screenIdx===3 — every round (including this
    // one) is always in the DOM now, so "do we have results yet" is
    // the only thing that matters for whether the chart should draw.
    if (this.results) {
      this._drawChart(this.results.filled);
    }
  }

  _drawChart(filled) {
    const svg = this.renderRoot.getElementById('dict-chart');
    if (!svg) return;
    svg.innerHTML = '';
    if (!filled.length) return;

    const cs = getComputedStyle(this.renderRoot.querySelector('.wrap-wide'));
    const accent = cs.getPropertyValue('--game-accent').trim() || '#4E7FFF';
    const accentDeep = cs.getPropertyValue('--game-accent-deep').trim() || accent;
    const gold = cs.getPropertyValue('--gold').trim() || '#b87503';

    const W = 640,
      ML = 20,
      MR = 20,
      MT = 34,
      MB = 40,
      laneGap = 30;
    const plotW = W - ML - MR;
    const dotR = 6;

    const x = d3
      .scaleLinear()
      .domain([0, POT])
      .range([ML, ML + plotW]);

    // Each round gets its own beeswarm — a tall pile in round 1 (say,
    // everyone anchoring near a "fair" 500) doesn't need to reserve
    // the same height in round 2, and vice versa (see crowd-wisdom.js
    // for why a fixed height wasted space in the exported report).
    const swarm1 = dodge(filled, (d) => x(d.r1), dotR + 1.5);
    const swarm2 = dodge(filled, (d) => x(d.r2), dotR + 1.5);
    const laneH1 = swarmHeight(swarm1, dotR);
    const laneH2 = swarmHeight(swarm2, dotR);
    const {
      baselines: [baseline1, baseline2],
      height: H,
    } = stackLanes([laneH1, laneH2], { firstTop: MT, gap: laneGap, bottom: MB });

    const svgSel = d3
      .select(svg)
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    // Lane backgrounds — round 2 (identified) gets the bolder tint of
    // the pair, same "individual vs. the more consequential state"
    // logic as crowd-wisdom's dot/average color split.
    svgSel
      .append('rect')
      .attr('x', 0)
      .attr('y', MT - 12)
      .attr('width', W)
      .attr('height', laneH1 + 12)
      .attr('rx', 14)
      .style('fill', `color-mix(in srgb, ${accent} 6%, white)`);
    svgSel
      .append('rect')
      .attr('x', 0)
      .attr('y', baseline1 + laneGap - 12)
      .attr('width', W)
      .attr('height', laneH2 + 12)
      .attr('rx', 14)
      .style('fill', `color-mix(in srgb, ${accentDeep} 8%, white)`);

    svgSel
      .append('text')
      .attr('x', 12)
      .attr('y', MT - 2)
      .style('font-size', '12px')
      .style('font-weight', 700)
      .style('fill', accent)
      .text('Раунд 1 · анонимно');
    svgSel
      .append('text')
      .attr('x', 12)
      .attr('y', baseline1 + laneGap - 2)
      .style('font-size', '12px')
      .style('font-weight', 700)
      .style('fill', accentDeep)
      .text('Раунд 2 · не анонимно');

    // Shared money axis along the bottom.
    svgSel
      .append('line')
      .attr('x1', ML)
      .attr('y1', baseline2)
      .attr('x2', ML + plotW)
      .attr('y2', baseline2)
      .style('stroke', 'var(--ink)')
      .style('stroke-width', 1.2);
    [0, 250, 500, 750, 1000].forEach((v) => {
      const tx = x(v);
      svgSel
        .append('line')
        .attr('x1', tx)
        .attr('y1', baseline2)
        .attr('x2', tx)
        .attr('y2', baseline2 + 5)
        .style('stroke', 'var(--ink-faint)');
      svgSel
        .append('text')
        .attr('x', tx)
        .attr('y', baseline2 + 18)
        .attr('text-anchor', 'middle')
        .style('font-size', '10.5px')
        .style('fill', 'var(--ink-faint)')
        .text(v);
    });

    const halfX = x(POT / 2);
    svgSel
      .append('line')
      .attr('x1', halfX)
      .attr('y1', MT - 12)
      .attr('x2', halfX)
      .attr('y2', baseline2)
      .style('stroke', gold)
      .style('stroke-width', 1.5)
      .style('stroke-dasharray', '5,4');
    svgSel
      .append('text')
      .attr('x', halfX)
      .attr('y', MT - 18)
      .attr('text-anchor', 'middle')
      .style('font-size', '10.5px')
      .style('font-weight', 700)
      .style('fill', gold)
      .text('поровну');

    const points1 = swarm1.map((s) => ({ ...s.data, cx: s.x, cy: baseline1 - dotR - 2 - s.y }));
    const points2 = swarm2.map((s) => ({ ...s.data, cx: s.x, cy: baseline2 - dotR - 2 - s.y }));
    // Same person, both rounds, keyed by name so the connecting line
    // below can find its matching pair regardless of dodge's sort order.
    const p1ByName = new Map(points1.map((p) => [p.name, p]));
    const p2ByName = new Map(points2.map((p) => [p.name, p]));

    // Faint line from a person's round-1 dot to their round-2 dot —
    // this is the actual finding the chart exists to show ("did
    // losing anonymity move this person's number, and which way"),
    // visible per-person instead of only as an aggregate delta.
    const links = svgSel
      .selectAll('line.dict-link')
      .data(filled)
      .join('line')
      .attr('class', 'dict-link')
      .attr('x1', (d) => p1ByName.get(d.name).cx)
      .attr('y1', (d) => p1ByName.get(d.name).cy)
      .attr('x2', (d) => p1ByName.get(d.name).cx)
      .attr('y2', (d) => p1ByName.get(d.name).cy)
      .style('stroke', 'var(--ink-faint)')
      .style('stroke-width', 1)
      .style('opacity', 0);

    links
      .transition()
      .delay((_, i) => i * 22 + 250)
      .duration(350)
      .attr('x2', (d) => p2ByName.get(d.name).cx)
      .attr('y2', (d) => p2ByName.get(d.name).cy)
      .style('opacity', 0.35);

    function ns(tag, attrs) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }

    // Draws one round's dots + hit circles, returns name -> dot node
    // so hover wiring (below, once both rounds exist) can reach across
    // rounds to highlight a person's OTHER dot too.
    const drawRound = (points, color, valueKey, roundLabel) => {
      const dots = svgSel
        .selectAll(null)
        .data(points)
        .join('circle')
        .attr('class', 'answer-dot')
        .attr('cx', (d) => d.cx)
        .attr('cy', (d) => d.cy)
        .attr('r', 0)
        .style('fill', color)
        .style('fill-opacity', 0.9)
        .style('stroke', 'var(--white)')
        .style('stroke-width', 1.3);

      dots
        .transition()
        .delay((_, i) => i * 22)
        .duration(400)
        .ease(d3.easeBackOut.overshoot(1.7))
        .attr('r', dotR);

      const dotNodes = dots.nodes();
      const nodesByName = new Map();
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
            `<b>${p.name}</b><span class="tip-row"><span>${roundLabel}</span><span>${p[valueKey]} ₽</span></span>`,
        );
        nodesByName.set(p.name, dotNodes[i]);
      });
      return nodesByName;
    };

    const nodes1 = drawRound(points1, accent, 'r1', 'Раунд 1 · анонимно');
    const nodes2 = drawRound(points2, accentDeep, 'r2', 'Раунд 2 · не анонимно');
    const linkNodes = links.nodes();
    const linkByName = new Map(filled.map((d, i) => [d.name, linkNodes[i]]));

    // Hovering either of a person's two dots highlights BOTH dots and
    // the line between them — the pairing (did this person's number
    // move, and which way) is the actual point of this chart, not
    // just whichever single dot happens to be under the cursor.
    filled.forEach((p) => {
      const setState = (on) => {
        [nodes1.get(p.name), nodes2.get(p.name)].forEach((node) => {
          d3.select(node)
            .style('fill-opacity', on ? 1 : 0.9)
            .attr('r', on ? dotR * 1.25 : dotR);
        });
        const link = linkByName.get(p.name);
        d3.select(link)
          .style('stroke', on ? accentDeep : 'var(--ink-faint)')
          .style('stroke-width', on ? 2 : 1)
          .style('opacity', on ? 0.9 : 0.35);
      };
      [nodes1.get(p.name), nodes2.get(p.name)].forEach((node) => {
        const hit = node.nextSibling;
        hit.addEventListener('mouseenter', () => setState(true));
        hit.addEventListener('mouseleave', () => setState(false));
      });
    });
  }

  _entryRow(row, idx, field) {
    return html`
      <div class="entry-row two-col">
        <div class="name">${unsafeHTML(avatarName(row.name))}</div>
        <input
          type="number"
          min="0"
          max="${POT}"
          inputmode="numeric"
          aria-label="${row.name}: ${field === 'r1' ? 'раунд 1' : 'раунд 2'}, сколько отдать (0–${POT})"
          placeholder="0–${POT}"
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
      <div class="wrap-wide" style=${gameAccentStyle('dictator')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
          <p class="eyebrow">Командное упражнение · 7 минут</p>
          <h1>Быстрое решение про деньги — дважды</h1>
          <p class="lede">
            Два раунда с одним и тем же выбором. Меняется только одна деталь — а вместе с ней,
            скорее всего, и суммы.
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
          <p class="eyebrow">Раунд 1 из 2 · Анонимно</p>
          <h2>Сколько каждый отдал — не зная, что решат остальные</h2>
          <p class="lede">Никто не узнает, кто сколько написал.</p>

          <div class="entry-head two-col">
            <div>Участник</div>
            <div>Отдал, ₽</div>
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
              @click=${() => this.flow.advance(2)}
            >
              Раунд 2 ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(1)}
        </section>

        <section class="${this.flow.roundClass(2)}" id="round-2">
          <div class="round-body">
          <p class="eyebrow">Раунд 2 из 2 · Вас увидят</p>
          <h2>То же решение, но уже не анонимно</h2>
          <p class="lede">Коллега узнает, кто именно принял это решение.</p>

          <div class="entry-head two-col">
            <div>Участник</div>
            <div>Отдал, ₽</div>
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
              @click=${() => this.flow.advance(3, () => this._showResults())}
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

          ${renderReveal({ value: r && r.delta !== null ? `${(r.delta >= 0 ? '+' : '') + Math.round(r.delta)} ₽` : '—', ...REVEAL_COPY.dictator(r && r.delta !== null ? { avgR1: r.avgR1, avgR2: r.avgR2, delta: r.delta, pot: POT } : null) })}

          <div class="group-compare">
            <div class="g low">
              <div class="t">Раунд 1 · анонимно, в среднем</div>
              <div class="v">${r ? `${Math.round(r.avgR1)} ₽` : '—'}</div>
            </div>
            <div class="g high">
              <div class="t">Раунд 2 · не анонимно, в среднем</div>
              <div class="v">${r ? `${Math.round(r.avgR2)} ₽` : '—'}</div>
            </div>
          </div>

          <div class="chart-wrap">
            <svg id="dict-chart" class="d3-chart-svg" viewBox="0 0 640 260"></svg>
            <div class="cap">
              Светлые точки — раунд 1 (анонимно), тёмные — раунд 2 (не анонимно). Линия соединяет
              пару точек одного человека — видно, куда сдвинулась его сумма.
            </div>
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
                        <td>${d.r1} ₽</td>
                        <td>${d.r2} ₽</td>
                        <td>${formatSigned(d.r2 - d.r1, ' ₽')}</td>
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
          <h1>Игра диктатора</h1>
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
            <div class="game-rail-title">Игра диктатора</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'dictator',
              stepLabels: ROUND_TITLES,
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-dictator', RetroGameDictator);
