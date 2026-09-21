/* =========================================================
   GAME: Эффект фрейминга (framing)

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 3) —
   same declarative group-split/click-to-swap pattern as endowment.js,
   plus the first game combining copy-to-clipboard (see barnum.js)
   with a hide/reveal spoiler toggle for two independent texts. Keeps
   all original plain ids (toggle-a/b, copy-a/b, text-a/b,
   placeholder-a/b, entry-body, results-table/tbody, ...).

   One-continuous-scroll деталка (docs/modernization-plan.md —
   "деталка продолжает карту") — originally prototyped here, now the
   shared shape of all 13 games (see game-shell.js). What was, in the
   old paged .screen/.screen.active model:
     - Every round is a plain always-visible <section class="round">
       (id="round-N") stacked in .game-main — no more .screen's
       display:none swap. `screenIdx` keeps its old meaning (how far
       the player has actually completed — gates each later round's
       .round-pending dim via `i > this.flow.screenIdx`) but no longer
       controls visibility.
     - A NEW `activeRound` state tracks which round the player is
       currently scrolled past (game-shell.js's observeRounds(), a
       scroll+rAF "reading line" check — see that file for why not an
       IntersectionObserver), driving the big vertical trail's
       traveler position in .game-rail — a sticky sidebar, always in
       view, per the "видеть прогресс игры всегда" ask, independent
       of `screenIdx`.
     - `goTo(idx)` is gone — see `_advance()`/`_scrollToRound()` below.
       A round's primary CTA now runs its existing action (if any)
       THEN plays a brief border flash on the round just finished
       (`justCompletedIdx`, styles.css's round-complete-flash) and
       smooth-scrolls to the next round; "Назад" buttons are now pure
       navigation (scroll to a round already on screen, no state
       change — nothing to "undo" when nothing was ever hidden).
     - No more .game-crumb breadcrumb ("← Все игры / <name>") — the
       game's name now sits next to the map (.game-rail-title, above
       the trail), and leaving is a plain × in the corner
       (.game-exit) that confirms first (window.confirm — no modal
       component exists in this app yet, and a native one is the
       cheapest correct answer for a single yes/no with real stakes:
       an in-progress attempt's draft gets cleared on exit, see
       _goHome()).
========================================================= */

import * as d3 from 'd3';
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ChartTip } from '../chart-tip.js';
import CONTENT from '../content/framing.json';
import { renderContext, renderNote, renderSteps } from '../content.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { RoundTimers } from '../controllers/round-timers.js';
import { SpoilerController } from '../controllers/spoiler-controller.js';
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
import { buildFramingEntries, loadableDraft, patchItem } from '../logic/entries.js';
import { framingFrame, framingReady, framingResults } from '../logic/results.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { Roles } from '../roles.js';
import { renderSpoilerCard } from '../spoiler-card.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const GROUP_LABEL = { A: 'А', B: 'Б' };
const FRAME_LABEL = { gain: 'выигрыш', loss: 'потеря' };
const ANSWER_TIMER_SECONDS = 40;

// The two scenarios. Each one has the SAME choice in two wordings —
// a gain frame ("saved / fixed") and a loss frame ("die / missed") with
// identical expected outcomes (a sure third vs a 1/3 gamble). In scenario 1
// group A hears the gain wording and B the loss one; in scenario 2 they swap
// (framingFrame() in logic/results.js), so everyone meets both wordings.
//   lines   the plain text sent to a group (copied to the clipboard)
//   shown   the same, typeset for the on-screen spoiler card
const SCENARIOS = [
  {
    name: 'Проект',
    title: 'Сценарий 1 · Проект на 600 человек',
    optionWord: 'Программа',
    intro: 'Готовится проект, в котором участвуют 600 человек. Есть две программы действий.',
    question: 'Какую программу вы выбираете?',
    gain: {
      lines: [
        'Программа 1 — спасено ровно 200 человек.',
        'Программа 2 — с вероятностью 1/3 спасены все 600, с вероятностью 2/3 не спасён никто.',
      ],
      shown: [
        'Программа 1 — «спасено ровно 200 человек».',
        'Программа 2 — «с вероятностью ⅓ спасены все 600, с вероятностью ⅔ не спасён никто».',
      ],
    },
    loss: {
      lines: [
        'Программа 1 — умрёт ровно 400 человек.',
        'Программа 2 — с вероятностью 1/3 никто не умрёт, с вероятностью 2/3 умрут все 600.',
      ],
      shown: [
        'Программа 1 — «умрёт ровно 400 человек».',
        'Программа 2 — «с вероятностью ⅓ никто не умрёт, с вероятностью ⅔ умрут все 600».',
      ],
    },
  },
  {
    name: 'Релиз',
    title: 'Сценарий 2 · Релиз и баги',
    optionWord: 'Стратегия',
    intro:
      'Через два дня релиз, а в продукте найдено 30 критичных багов. Исправить всё до дедлайна невозможно — есть две стратегии.',
    question: 'Какую стратегию вы выбираете?',
    gain: {
      lines: [
        'Стратегия 1 — гарантированно исправим ровно 10 багов.',
        'Стратегия 2 — с вероятностью 1/3 исправим все 30 багов, с вероятностью 2/3 не исправим ни одного.',
      ],
      shown: [
        'Стратегия 1 — «гарантированно исправим ровно 10 багов».',
        'Стратегия 2 — «с вероятностью ⅓ исправим все 30, с вероятностью ⅔ не исправим ни одного».',
      ],
    },
    loss: {
      lines: [
        'Стратегия 1 — гарантированно пропустим в релиз ровно 20 багов.',
        'Стратегия 2 — с вероятностью 1/3 не пропустим ни одного бага, с вероятностью 2/3 пропустим все 30.',
      ],
      shown: [
        'Стратегия 1 — «гарантированно пропустим в релиз ровно 20 багов».',
        'Стратегия 2 — «с вероятностью ⅓ не пропустим ни одного, с вероятностью ⅔ пропустим все 30».',
      ],
    },
  },
];
const ROUND_COUNT = SCENARIOS.length;
const FIRST_SCENARIO_ROUND = 2;
const ENTRY_ROUND = FIRST_SCENARIO_ROUND + ROUND_COUNT; // 4
const RESULTS_ROUND = ENTRY_ROUND + 1; // 5
const CONTEXT_ROUND = RESULTS_ROUND + 1; // 6
const TOTAL_SCREENS = CONTEXT_ROUND + 1;

// One title per round, in order — the ONLY thing a not-yet-reached
// round shows (see .round-lock in render()): the rest of that
// round's real content still renders underneath so its actual layout
// height is correct, just blurred and inert (pointer-events:none),
// per the "видно только куда идёшь, не что там" ask. Kept as one
// array instead of re-deriving from each round's own <h1>/<h2> text
// so there's exactly one place to update a title.
const ROUND_TITLES = [
  'Один выбор, две формулировки',
  'Кто в какой группе',
  ...SCENARIOS.map((sc) => sc.title),
  'Впишите выбор каждого участника',
  'Что получилось у вашей команды',
  'Эффект фрейминга',
];

// Plain text of the scenario as one group hears it (what gets copied).
const scenarioText = (round, group) => {
  const sc = SCENARIOS[round];
  return `${sc.intro}\n\n${sc[framingFrame(group, round)].lines.join('\n')}\n\n${sc.question}`;
};

// Spoiler-card keys: 'a'/'b' for scenario 1 (the original ids, kept as they
// were), 'a2'/'b2' for scenario 2.
const cardKey = (group, round) => `${group.toLowerCase()}${round === 0 ? '' : round + 1}`;

export class RetroGameFraming extends LitElement {
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
    this.entries = buildFramingEntries(this.groups);
    this.results = null;
    this.selectedSwapName = null;
    this.shuffleSpin = false;
    this.spoilers = new SpoilerController(this, this._spoilerKeys());
    // One timer, live for one scenario at a time; each scenario keeps its own length.
    this.timers = new RoundTimers(this, { seconds: ANSWER_TIMER_SECONDS, count: SCENARIOS.length });

    this.draft = loadableDraft(Persist.load('framing'), {
      key: 'entries',
      length: state.participants.length,
      // drafts of the single-scenario version stored one `choice`, not `choices[]`
      rowCheck: (row) => Array.isArray(row.choices) && row.choices.length === ROUND_COUNT,
    });
  }

  // Every spoiler text starts hidden: 'a'/'b' (scenario 1), 'a2'/'b2' (scenario 2).
  _spoilerKeys() {
    return SCENARIOS.flatMap((_, round) => [cardKey('A', round), cardKey('B', round)]);
  }

  updated() {
    if (this.results) {
      this.results.perRound.forEach((_, round) => {
        this._drawRoundChart(round);
      });
    }
  }

  _restoreDraft() {
    this.flow.advance(ENTRY_ROUND, () => {
      this.groups = this.draft.payload.groups;
      this.entries = this.draft.payload.entries;
      this.draft = null;
    });
  }

  _discardDraft() {
    Persist.clear('framing');
    this.draft = null;
  }

  _goHome() {
    Persist.clear('framing');
    renderHome();
  }

  _onShuffle() {
    this.groups = Roles.makeGroups(state.participants);
    this.entries = buildFramingEntries(this.groups);
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

  // Matches the legacy behaviour exactly: pressing "Вносить данные →"
  // always (re)builds fresh blank entries for the current groups —
  // see docs/modernization-plan.md / this file's git history if that
  // ever needs revisiting; preserved as-is here, not a new choice.
  _enterData() {
    this.entries = buildFramingEntries(this.groups, ROUND_COUNT);
  }

  _onToggleChoice(idx, round, val) {
    this.entries = patchItem(this.entries, idx, 'choices', round, val);
    Persist.save('framing', { groups: this.groups, entries: this.entries });
  }

  // How many people answered every scenario.
  _completeCount() {
    return this.entries.filter((e) => e.choices.every((c) => c !== null)).length;
  }

  _nextFromScenario(round) {
    this.timers.reset();
    // Reaching the entry screen builds it fresh, like the single-scenario version did.
    const isLast = round === ROUND_COUNT - 1;
    this.flow.advance(
      FIRST_SCENARIO_ROUND + round + 1,
      isLast ? () => this._enterData() : undefined,
    );
  }

  _showResults() {
    this.results = framingResults(this.entries, ROUND_COUNT);
    const { filled } = this.results;

    ReportExport.register(
      'framing',
      {
        subtitle:
          'Один и тот же выбор выглядит разумным или рискованным — в зависимости от формулировки.',
        meta: ReportExport.meta(filled.length, '2 сценария: проект и релиз'),
        explanation:
          'Одна и та же по сути информация, поданная как выигрыш или как потеря, приводит к разным решениям — хотя математически варианты идентичны. Классический эксперимент — Tversky, Kahneman (1981), легший в основу теории перспектив, за которую Канеман получил Нобелевскую премию по экономике в 2002 году. Второй сценарий — та же логика на рабочей ситуации: сколько багов пропустить до дедлайна.',
      },
      this.renderRoot,
    );
  }

  // Who picked what, per group, as an interactive d3 beeswarm instead
  // of just two percentages — every dot is one person (hover for name
  // + choice), colored by the same accent/red group pairing used
  // everywhere else this game shows Group A/Б. Lane backgrounds keep
  // it readable as "two rows, two columns" even before you register
  // any single dot; the drop-in animation (d3.easeBackOut, staggered
  // per dot) is the same "give it some game-like personality" move as
  // the chunky buttons elsewhere, just applied to a chart instead of a
  // button.
  _drawRoundChart(round) {
    const svg = this.renderRoot.getElementById(`framing-chart-${round}`);
    if (!svg) return;
    svg.innerHTML = '';
    const filled = this.results.perRound[round].points;
    if (!filled.length) return;
    const optionWord = SCENARIOS[round].optionWord;

    const wrap = this.renderRoot.querySelector('.wrap-wide');
    const cs = getComputedStyle(wrap);
    const COLOR = {
      A: cs.getPropertyValue('--game-accent').trim() || '#4E7FFF',
      B: cs.getPropertyValue('--red').trim() || '#ef3061',
    };

    const W = 640,
      H = 300;
    const M = { top: 40, right: 16, bottom: 8, left: 16 };
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;

    const svgSel = d3
      .select(svg)
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');
    const root = svgSel.append('g').attr('transform', `translate(${M.left},${M.top})`);

    const x = d3
      .scalePoint()
      .domain(['1', '2'])
      .range([plotW * 0.22, plotW * 0.78]);
    const y = d3.scaleBand().domain(['A', 'B']).range([0, plotH]).padding(0.3);
    const laneH = y.bandwidth();

    ['1', '2'].forEach((choice) => {
      root
        .append('text')
        .attr('x', x(choice))
        .attr('y', -16)
        .attr('text-anchor', 'middle')
        .style('font-size', '12.5px')
        .style('font-weight', 700)
        .style('fill', 'var(--ink-faint)')
        .style('text-transform', 'uppercase')
        .style('letter-spacing', '0.04em')
        .text(`${optionWord} ${choice}`);
    });

    root
      .append('line')
      .attr('x1', plotW / 2)
      .attr('x2', plotW / 2)
      .attr('y1', -8)
      .attr('y2', plotH + 8)
      .style('stroke', 'var(--line)')
      .style('stroke-dasharray', '3,5');

    ['A', 'B'].forEach((gKey) => {
      const laneY = y(gKey);
      root
        .append('rect')
        .attr('x', 0)
        .attr('y', laneY)
        .attr('width', plotW)
        .attr('height', laneH)
        .attr('rx', 16)
        .style('fill', `color-mix(in srgb, ${COLOR[gKey]} 7%, white)`);
      root
        .append('text')
        .attr('x', 14)
        .attr('y', laneY + 22)
        .style('font-size', '13px')
        .style('font-weight', 700)
        .style('fill', COLOR[gKey])
        .text(`Группа ${GROUP_LABEL[gKey]} · ${FRAME_LABEL[framingFrame(gKey, round)]}`);
    });

    const buckets = new Map();
    filled.forEach((p) => {
      const key = p.group + p.choice;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    });

    const dotR = 8;
    const spacing = 20;
    const allPoints = [];
    buckets.forEach((people, key) => {
      const gKey = key[0];
      const choice = key[1];
      const cols = Math.min(people.length, 6);
      const rowCount = Math.ceil(people.length / cols);
      people.forEach((p, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        allPoints.push({
          ...p,
          cx: x(choice) + (col - (cols - 1) / 2) * spacing,
          cy: y(gKey) + laneH / 2 + (row - (rowCount - 1) / 2) * spacing,
          color: COLOR[gKey],
        });
      });
    });

    const dots = root
      .selectAll('circle.answer-dot')
      .data(allPoints)
      .join('circle')
      .attr('class', 'answer-dot')
      .attr('cx', (d) => d.cx)
      .attr('cy', (d) => d.cy)
      .attr('r', 0)
      .style('fill', (d) => d.color)
      .style('fill-opacity', 0.9)
      .style('stroke', 'var(--white)')
      .style('stroke-width', 1.5);

    dots
      .transition()
      .delay((_d, i) => i * 28)
      .duration(420)
      .ease(d3.easeBackOut.overshoot(1.7))
      .attr('r', dotR);

    function ns(tag, attrs) {
      const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    }
    // A bare 8px circle is a fiddly hover target, so each dot gets a
    // larger invisible hit circle layered on top — inserted right
    // after its own dot (not all batched on afterward) so the DOM
    // stays a plain [visible, hit, visible, hit, ...] sequence, same
    // as every other chart's hand-rolled forEach() produces. Wiring
    // the hit circle's own enter/leave to brighten + grow the
    // underlying dot is what makes hovering feel connected to the dot
    // you're actually pointing at, not just the tooltip appearing.
    const dotNodes = dots.nodes();
    allPoints.forEach((p, i) => {
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
          `<b>${p.name}</b><span class="tip-row"><span>Группа</span><span>${GROUP_LABEL[p.group]}</span></span><span class="tip-row"><span>Формулировка</span><span>${FRAME_LABEL[p.frame]}</span></span><span class="tip-row"><span>Выбор</span><span>${optionWord} ${p.choice}</span></span>`,
      );
      hit.addEventListener('mouseenter', () => {
        d3.select(dotNodes[i])
          .style('fill-opacity', 1)
          .attr('r', dotR * 1.2);
      });
      hit.addEventListener('mouseleave', () => {
        d3.select(dotNodes[i]).style('fill-opacity', 0.9).attr('r', dotR);
      });
    });
  }

  async _reset() {
    this.groups = Roles.makeGroups(state.participants);
    this.selectedSwapName = null;
    this.entries = buildFramingEntries(this.groups);
    this.results = null;
    this.spoilers.hideAll();
    this.timers.resetAll();
    Persist.clear('framing');
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
            Группа А <span class="note" style="margin:0;">· ${groupA.length} чел.</span>
          </div>
          <div class="role-group-chips">${groupA.map(chip)}</div>
        </div>
        <div class="role-group-col role-group-b">
          <div class="role-group-title">
            Группа Б <span class="note" style="margin:0;">· ${groupB.length} чел.</span>
          </div>
          <div class="role-group-chips">${groupB.map(chip)}</div>
        </div>
      </div>
      <p class="note swap-hint">Нажмите на двух участников по очереди, чтобы поменять их местами.</p>
    `;
  }

  // One group's card for one scenario: the wording that group hears (a spoiler,
  // so the facilitator can copy it privately instead of reading both aloud) and
  // who to send it to.
  _spoilerCard(round, group, borderColor) {
    const groupLabel = GROUP_LABEL[group];
    const members = group === 'A' ? this.groups.groupA : this.groups.groupB;
    const wording = SCENARIOS[round][framingFrame(group, round)];
    return renderSpoilerCard(this.spoilers, {
      key: cardKey(group, round),
      title: `Группа ${groupLabel}`,
      hint: `Текст скрыт — нажмите «Показать», чтобы прочитать самому, или сразу скопируйте и отправьте группе ${groupLabel} в чат.`,
      body: html`${wording.shown[0]}<br />${wording.shown[1]}`,
      copyText: scenarioText(round, group),
      borderColor,
      footer: html`
        <div class="spoiler-members">
          <span class="spoiler-members-label">Кому отправлять · ${members.length} чел.</span>
          <div class="role-group-chips">
            ${members.map((n) => html`<span class="role-chip readonly">${unsafeHTML(avatarName(n))}</span>`)}
          </div>
        </div>
      `,
    });
  }

  // One scenario: its situation, the wording each group gets, and a timer.
  _scenarioRound(round) {
    const sc = SCENARIOS[round];
    const roundIdx = FIRST_SCENARIO_ROUND + round;
    const isLast = round === ROUND_COUNT - 1;
    return html`
      <section class="${this.flow.roundClass(roundIdx)}" id="round-${roundIdx}">
        <div class="round-body">
          <p class="eyebrow">Сценарий ${round + 1} из ${ROUND_COUNT}${round > 0 ? ' · рабочая ситуация' : ''}</p>
          <h2>${sc.title}</h2>
          <p class="lede">
            ${sc.intro}
            Тексты спрятаны — раскройте или скопируйте только тот, что нужен, и отправьте его
            своей группе в чат.
          </p>

          ${this._spoilerCard(round, 'A', 'var(--game-accent, var(--blue))')}
          ${this._spoilerCard(round, 'B', 'var(--red)')}

          ${this.timers.card(round, { runningLabel: 'Запустите, когда тексты уже отправлены группам — на обсуждение и ответ' })}

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(roundIdx - 1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" id="next-scenario-${round}" @click=${() => this._nextFromScenario(round)}>
              ${isLast ? 'Вносить данные' : `Сценарий ${round + 2} · ${SCENARIOS[round + 1].name.toLowerCase()}`} ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
        </div>
        ${this.flow.lock(roundIdx)}
      </section>
    `;
  }

  _entrySection(title, list, cls) {
    return html`
      <div class="team-entry-group ${cls}">
        <div class="team-entry-group-title">${title} <span class="count">· ${list.length} чел.</span></div>
        <div class="team-entry-list">
          ${list.map(
            (e) => html`
              <div class="team-entry-card wide-control multi-choice">
                <div class="team-entry-name">${unsafeHTML(avatarName(e.name))}</div>
                <div class="choice-rows">
                  ${SCENARIOS.map(
                    (sc, round) => html`
                      <div class="choice-row" data-round=${round}>
                        <span class="choice-label">${sc.name}</span>
                        <div class="toggle-pair">
                          ${['1', '2'].map(
                            (val) => html`
                              <button
                                type="button"
                                data-val=${val}
                                class="${e.choices[round] === val ? 'on' : ''}"
                                @click=${() => this._onToggleChoice(e.idx, round, val)}
                              >
                                ${sc.optionWord} ${val}
                              </button>
                            `,
                          )}
                        </div>
                      </div>
                    `,
                  )}
                </div>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  // One scenario's results: the two wordings side by side (so everyone sees exactly
  // what the other group was told), who heard each, how many gambled, and the chart.
  _resultsForRound(round) {
    const r = this.results;
    const sc = SCENARIOS[round];
    const pr = r?.perRound[round];
    const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
    const card = (frame, cls) => {
      const group = ['A', 'B'].find((g) => framingFrame(g, round) === frame);
      const members = group === 'A' ? this.groups.groupA : this.groups.groupB;
      const wording = sc[frame];
      return html`
        <div class="g ${cls} wording-card">
          <div class="t">Формулировка ${frame === 'gain' ? 'выигрыша' : 'потери'} · слышала группа ${GROUP_LABEL[group]}</div>
          <p class="wording-text">${wording.shown[0]}<br />${wording.shown[1]}</p>
          <div class="wording-members">
            ${members.map((n) => html`<span class="role-chip readonly">${unsafeHTML(avatarName(n))}</span>`)}
          </div>
          <div class="t">Выбрали рискованный вариант</div>
          <div class="v">${pct(frame === 'gain' ? pr?.gainRisky : pr?.lossRisky)}</div>
        </div>
      `;
    };
    return html`
      <h3 class="scenario-result-title">${sc.title}</h3>
      <p class="note scenario-situation">${sc.intro}</p>
      <div class="group-compare wording-compare">
        ${card('gain', 'low team-a')} ${card('loss', 'high team-b')}
      </div>
      <div class="d3-chart-card">
        <div class="d3-chart-title">Кто что выбрал · ${sc.name.toLowerCase()}</div>
        <svg id="framing-chart-${round}" class="d3-chart-svg" role="img" aria-label="Выбор каждого участника по группам, сценарий ${round + 1}"></svg>
      </div>
    `;
  }

  render() {
    const complete = this._completeCount();
    const ready = framingReady(this.entries, ROUND_COUNT);
    const r = this.results;
    const withIdx = this.entries.map((e, i) => ({ ...e, idx: i }));
    const listA = withIdx.filter((e) => e.group === 'A');
    const listB = withIdx.filter((e) => e.group === 'B');

    return html`
      <div class="wrap-wide" style=${gameAccentStyle('framing')}>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
        <section class="${this.flow.roundClass(0)}" id="round-0">
          <div class="round-body">
          <p class="eyebrow">Командное упражнение · 11 минут</p>
          <h1>Один выбор, две формулировки</h1>
          <p class="lede">
            Мы разделим вас на две группы. Каждая услышит свою версию одной и той же дилеммы — с
            одинаковыми числами внутри. Два сценария: сначала история про людей, потом рабочая
            ситуация про баги перед релизом.
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
          <h2>Кто в какой группе</h2>
          <p class="lede">Не нравится расклад — перемешайте.</p>

          <div>${this._groupsHolder()}</div>
          <button
            class="shuffle-btn ${this.shuffleSpin ? 'spin' : ''}"
            @click=${() => this._onShuffle()}
          >
            ${unsafeHTML(ICON_SHUFFLE)} Перемешать группы
          </button>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(0)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.flow.advance(FIRST_SCENARIO_ROUND)}>Дальше ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(1)}
        </section>

        ${SCENARIOS.map((_, round) => this._scenarioRound(round))}

        <section class="${this.flow.roundClass(ENTRY_ROUND)}" id="round-${ENTRY_ROUND}">
          <div class="round-body">
          <p class="eyebrow">Сбор данных</p>
          <h2>Впишите выбор каждого участника</h2>
          <p class="lede">Для каждого сценария — вариант 1 или вариант 2, по формулировке, которую слышал этот участник.</p>

          <div id="entry-body">
            ${this._entrySection('Группа А', listA, 'team-a')}
            ${this._entrySection('Группа Б', listB, 'team-b')}
          </div>

          <div class="fill-progress">
            Ответили на оба сценария: <span>${complete}</span> из <span>${this.entries.length}</span>
            <div class="track">
              <div style="width:${(complete / this.entries.length) * 100}%"></div>
            </div>
          </div>
          <p class="note">Чтобы сравнить формулировки, в каждом сценарии нужен ответ хотя бы из каждой группы.</p>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(ENTRY_ROUND - 1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" id="next-btn" ?disabled=${!ready} @click=${() => this.flow.advance(RESULTS_ROUND, () => this._showResults())}>
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
            value: r ? r.flipText : '—',
            ...REVEAL_COPY.framing(
              r
                ? {
                    gainRisky: r.gainRisky,
                    lossRisky: r.lossRisky,
                    rounds: r.perRound.map((x, i) => ({
                      name: SCENARIOS[i].name,
                      gainRisky: x.gainRisky,
                      lossRisky: x.lossRisky,
                    })),
                  }
                : null,
            ),
          })}

          ${SCENARIOS.map((_, round) => this._resultsForRound(round))}

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Группа</th>
                ${SCENARIOS.map((sc) => html`<th>${sc.name}</th>`)}
              </tr>
            </thead>
            <tbody id="results-tbody">
              ${
                r
                  ? r.filled.map(
                      (e) => html`
                      <tr>
                        <td class="name">${unsafeHTML(avatarName(e.name))}</td>
                        <td>${GROUP_LABEL[e.group]}</td>
                        ${e.choices.map((c, round) => html`<td>${c === null ? '—' : `${SCENARIOS[round].optionWord} ${c} · ${FRAME_LABEL[framingFrame(e.group, round)]}`}</td>`)}
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
          <h1>Эффект фрейминга</h1>
          ${renderContext(CONTENT.context)}

          <h2>Ещё немного фактов</h2>

          ${renderSteps(CONTENT.facts)}

          <div class="nav-row">
            <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
            <span></span>
          </div>
          </div>
          ${this.flow.lock(CONTEXT_ROUND)}
        </section>
          </div>

          <aside class="game-rail">
            <div class="game-rail-title">Эффект фрейминга</div>
            ${renderTrail({
              current: this.flow.activeRound,
              total: TOTAL_SCREENS,
              gameId: 'framing',
              stepLabels: ROUND_TITLES,
            })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-framing', RetroGameFraming);
