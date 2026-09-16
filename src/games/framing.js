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
import { AnswerTimerController } from '../controllers/answer-timer-controller.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { confirmExit, renderAnswerTimer, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import {
  ICON_CLIPBOARD,
  ICON_COPY,
  ICON_DOWNLOAD,
  ICON_HIDE,
  ICON_LEFT,
  ICON_RIGHT,
  ICON_SHOW,
  ICON_SHUFFLE,
  ICON_X,
} from '../icons.js';
import {
  buildFramingEntries,
  countFilled,
  hasEnough,
  hasFields,
  loadableDraft,
  patchRow,
} from '../logic/entries.js';
import { framingResults } from '../logic/results.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { Roles } from '../roles.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { copyToClipboard } from '../toast.js';

const TOTAL_SCREENS = 6;
const GROUP_LABEL = { A: 'А', B: 'Б' };
const ANSWER_TIMER_SECONDS = 120;

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
  'Текст для каждой группы — по отдельности',
  'Впишите выбор каждого участника',
  'Что получилось у вашей команды',
  'Эффект фрейминга',
];

// Spoiler + copy-to-clipboard for each group's scenario text, so the
// facilitator can send the right wording privately instead of
// reading both aloud off a shared screen.
const SCENARIO_TEXT = {
  a:
    'Готовится проект, в котором участвуют 600 человек. Есть две программы действий.\n\n' +
    'Программа 1 — спасено ровно 200 человек.\n' +
    'Программа 2 — с вероятностью 1/3 спасены все 600, с вероятностью 2/3 не спасён никто.\n\n' +
    'Какую программу вы выбираете?',
  b:
    'Готовится проект, в котором участвуют 600 человек. Есть две программы действий.\n\n' +
    'Программа 1 — умрёт ровно 400 человек.\n' +
    'Программа 2 — с вероятностью 1/3 никто не умрёт, с вероятностью 2/3 умрут все 600.\n\n' +
    'Какую программу вы выбираете?',
};

export class RetroGameFraming extends LitElement {
  static styles = sharedStyles;

  static properties = {
    groups: { state: true },
    entries: { state: true },
    draft: { state: true },
    results: { state: true },
    selectedSwapName: { state: true },
    shuffleSpin: { state: true },
    textHidden: { state: true },
  };

  constructor() {
    super();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.groups = Roles.makeGroups(state.participants);
    this.entries = buildFramingEntries(this.groups);
    this.results = null;
    this.selectedSwapName = null;
    this.shuffleSpin = false;
    this.textHidden = { a: true, b: true };
    this.timer = new AnswerTimerController(this, ANSWER_TIMER_SECONDS);

    this.draft = loadableDraft(Persist.load('framing'), {
      key: 'entries',
      length: state.participants.length,
    });
  }

  updated() {
    if (this.results) {
      this._drawAnswerChart(this.results.filled);
    }
  }

  _restoreDraft() {
    this.flow.advance(3, () => {
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

  _toggleText(key) {
    this.textHidden = { ...this.textHidden, [key]: !this.textHidden[key] };
  }

  _copyText(key, e) {
    copyToClipboard(SCENARIO_TEXT[key], e.currentTarget);
  }

  // Matches the legacy behaviour exactly: pressing "Вносить данные →"
  // always (re)builds fresh blank entries for the current groups —
  // see docs/modernization-plan.md / this file's git history if that
  // ever needs revisiting; preserved as-is here, not a new choice.
  _enterData() {
    this.entries = buildFramingEntries(this.groups);
  }

  _onToggleChoice(idx, val) {
    this.entries = patchRow(this.entries, idx, { choice: val });
    Persist.save('framing', { groups: this.groups, entries: this.entries });
  }

  _filledCount() {
    return countFilled(this.entries, hasFields('choice'));
  }

  _showResults() {
    this.results = framingResults(this.entries);
    const { filled } = this.results;

    ReportExport.register(
      'framing',
      {
        subtitle:
          'Один и тот же выбор выглядит разумным или рискованным — в зависимости от формулировки.',
        meta: ReportExport.meta(filled.length),
        explanation:
          'Одна и та же по сути информация, поданная как выигрыш или как потеря, приводит к разным решениям — хотя математически варианты идентичны. Классический эксперимент — Tversky, Kahneman (1981), легший в основу теории перспектив, за которую Канеман получил Нобелевскую премию по экономике в 2002 году.',
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
  _drawAnswerChart(filled) {
    const svg = this.renderRoot.getElementById('framing-chart');
    if (!svg) return;
    svg.innerHTML = '';
    if (!filled.length) return;

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
        .text(`Программа ${choice}`);
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
        .text(`Группа ${GROUP_LABEL[gKey]}`);
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
          `<b>${p.name}</b><span class="tip-row"><span>Группа</span><span>${GROUP_LABEL[p.group]}</span></span><span class="tip-row"><span>Выбор</span><span>Программа ${p.choice}</span></span>`,
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
    this.textHidden = { a: true, b: true };
    this.timer.reset();
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

  _spoilerCard(key, groupLabel, borderColor, members) {
    const hidden = this.textHidden[key];
    return html`
      <div class="quote-card spoiler-card" style=${borderColor ? `border-left-color:${borderColor};` : ''}>
        <div class="spoiler-head">
          <b>Группа ${groupLabel}</b>
          <div class="spoiler-actions">
            <button
              type="button"
              class="ghost spoiler-toggle"
              id="toggle-${key}"
              @click=${() => this._toggleText(key)}
            >
              ${hidden ? html`${unsafeHTML(ICON_SHOW)} Показать` : html`${unsafeHTML(ICON_HIDE)} Скрыть`}
            </button>
            <!-- .btn-label wraps only the text, not the icon:
                 copyToClipboard() (toast.js) swaps that span's text
                 imperatively for the "✓ Скопировано" feedback — doing
                 that to the whole button would delete the icon's
                 Lit-managed ChildPart along with it and throw on the
                 next render ("ChildPart has no parentNode"). -->
            <button type="button" class="ghost" id="copy-${key}" @click=${(e) => this._copyText(key, e)}>
              ${unsafeHTML(ICON_COPY)} <span class="btn-label">Скопировать</span>
            </button>
          </div>
        </div>
        <p class="spoiler-placeholder" id="placeholder-${key}" ?hidden=${!hidden}>
          Текст скрыт — нажмите «Показать», чтобы прочитать самому, или сразу скопируйте и
          отправьте группе ${groupLabel} в чат.
        </p>
        <p class="spoiler-text" id="text-${key}" ?hidden=${hidden}>
          ${
            key === 'a'
              ? html`Программа 1 — «спасено ровно 200 человек».<br />Программа 2 — «с вероятностью
              ⅓ спасены все 600, с вероятностью ⅔ не спасён никто».`
              : html`Программа 1 — «умрёт ровно 400 человек».<br />Программа 2 — «с вероятностью ⅓
              никто не умрёт, с вероятностью ⅔ умрут все 600».`
          }
        </p>
        <div class="spoiler-members">
          <span class="spoiler-members-label">Кому отправлять · ${members.length} чел.</span>
          <div class="role-group-chips">
            ${members.map((n) => html`<span class="role-chip readonly">${unsafeHTML(avatarName(n))}</span>`)}
          </div>
        </div>
      </div>
    `;
  }

  _entrySection(title, list, cls) {
    return html`
      <div class="team-entry-group ${cls}">
        <div class="team-entry-group-title">${title} <span class="count">· ${list.length} чел.</span></div>
        <div class="team-entry-list">
          ${list.map(
            (e) => html`
              <div class="team-entry-card wide-control">
                <div class="team-entry-name">${unsafeHTML(avatarName(e.name))}</div>
                <div class="toggle-pair">
                  <button
                    type="button"
                    data-val="1"
                    class="${e.choice === '1' ? 'on' : ''}"
                    @click=${() => this._onToggleChoice(e.idx, '1')}
                  >
                    Программа 1
                  </button>
                  <button
                    type="button"
                    data-val="2"
                    class="${e.choice === '2' ? 'on' : ''}"
                    @click=${() => this._onToggleChoice(e.idx, '2')}
                  >
                    Программа 2
                  </button>
                </div>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  render() {
    const filled = this._filledCount();
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
          <p class="eyebrow">Командное упражнение · 7 минут</p>
          <h1>Один выбор, две формулировки</h1>
          <p class="lede">
            Мы разделим вас на две группы. Каждая услышит свою версию одной и той же дилеммы — с
            одинаковыми числами внутри.
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

          <ol class="step-list">
            <li>
              <div class="step-num">1</div>
              <div class="step-body">
                <b>Группы получат разные формулировки</b>
                <span>Числа и суть решения одинаковы для всех — отличаются только слова, которыми это описано.</span>
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Каждый выбирает одну из двух программ</b>
                <span>Программу 1 или Программу 2 — только свою, из формулировки для своей группы.</span>
              </div>
            </li>
          </ol>

          <p class="note">Дальше мы распределим группы и покажем каждой её текст отдельно.</p>

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
            <button class="primary" @click=${() => this.flow.advance(2)}>Дальше ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(1)}
        </section>

        <section class="${this.flow.roundClass(2)}" id="round-2">
          <div class="round-body">
          <p class="eyebrow">Сценарий</p>
          <h2>Текст для каждой группы — по отдельности</h2>
          <p class="lede">
            Готовится проект, в котором участвуют 600 человек. Есть две программы действий.
            Тексты спрятаны — раскройте или скопируйте только тот, что нужен, и отправьте его
            своей группе в чат.
          </p>

          ${this._spoilerCard('a', 'А', 'var(--game-accent, var(--blue))', this.groups.groupA)}
          ${this._spoilerCard('b', 'Б', 'var(--red)', this.groups.groupB)}

          ${renderAnswerTimer(this.timer, {
            runningLabel: 'Запустите, когда тексты уже отправлены группам — на обсуждение и ответ',
          })}

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.flow.advance(3, () => this._enterData())}>Вносить данные ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(2)}
        </section>

        <section class="${this.flow.roundClass(3)}" id="round-3">
          <div class="round-body">
          <p class="eyebrow">Сбор данных</p>
          <h2>Впишите выбор каждого участника</h2>
          <p class="lede">Программа 1 или Программа 2 — по формулировке своей группы.</p>

          <div id="entry-body">
            ${this._entrySection('Группа А', listA, 'team-a')}
            ${this._entrySection('Группа Б', listB, 'team-b')}
          </div>

          <div class="fill-progress">
            Заполнено: <span>${filled}</span> из <span>${this.entries.length}</span>
            <div class="track">
              <div style="width:${(filled / this.entries.length) * 100}%"></div>
            </div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(2)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" ?disabled=${!hasEnough(filled)} @click=${() => this.flow.advance(4, () => this._showResults())}>
              Показать результаты ${unsafeHTML(ICON_RIGHT)}
            </button>
          </div>
          </div>
          ${this.flow.lock(3)}
        </section>

        <section class="${this.flow.roundClass(4)}" id="round-4">
          <div class="round-body">
          <p class="eyebrow">Результаты</p>
          <h2>Что получилось у вашей команды</h2>

          ${renderReveal({ value: r ? r.flipText : '—', ...REVEAL_COPY.framing(r ? { aRisky: r.aRisky, bRisky: r.bRisky } : null) })}

          <div class="group-compare">
            <div class="g low team-a">
              <div class="t">Группа А (формулировка выигрыша) · риск</div>
              <div class="v">${r && r.aRisky !== null ? `${r.aRisky}%` : '—'}</div>
            </div>
            <div class="g high team-b">
              <div class="t">Группа Б (формулировка потери) · риск</div>
              <div class="v">${r && r.bRisky !== null ? `${r.bRisky}%` : '—'}</div>
            </div>
          </div>

          <div class="d3-chart-card">
            <div class="d3-chart-title">Кто что выбрал</div>
            <svg id="framing-chart" class="d3-chart-svg" aria-label="Выбор каждого участника по группам"></svg>
          </div>

          <table class="results-table" id="results-table">
            <thead>
              <tr>
                <th>Участник</th>
                <th>Группа</th>
                <th>Выбор</th>
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
                        <td>Программа ${e.choice}</td>
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
            <button class="ghost" @click=${() => this.flow.scrollTo(3)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            <button class="primary" @click=${() => this.flow.advance(5)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
          </div>
          </div>
          ${this.flow.lock(4)}
        </section>

        <section class="${this.flow.roundClass(5)}" id="round-5">
          <div class="round-body">
          <p class="eyebrow">А теперь — контекст</p>
          <h1>Эффект фрейминга</h1>
          <p class="lede">
            Одна и та же по сути информация, поданная как «выигрыш» или как «потеря», приводит к
            разным решениям — хотя математически варианты идентичны.
          </p>

          <p>
            Это адаптация знаменитой «проблемы азиатской болезни» из статьи Tversky A., Kahneman
            D. (1981). The Framing of Decisions and the Psychology of Choice. <i>Science</i>,
            211(4481) — одного из ключевых экспериментов, лёгших в основу «теории перспектив»
            (prospect theory), за которую Канеман получил Нобелевскую премию по экономике в 2002
            году.
          </p>

          <div class="stat-row">
            <div class="stat">
              <div class="n">~72%</div>
              <div class="lab">выбирают безопасный вариант при формулировке выигрыша</div>
            </div>
            <div class="stat">
              <div class="n">~78%</div>
              <div class="lab">выбирают рискованный вариант при формулировке потери</div>
            </div>
          </div>

          <p>
            <b>Почему одинаковые числа ощущаются по-разному.</b> Согласно теории перспектив, люди
            оценивают исходы не в абсолютных величинах, а относительно точки отсчёта — и реагируют
            на выигрыши и потери несимметрично. Когда решение подано как выигрыш («спасено 200 из
            600»), мы становимся осторожными: гарантированный небольшой выигрыш кажется
            привлекательнее, чем риск потерять его в погоне за большим. Когда то же самое подано
            как потеря («умрёт 400 из 600»), психологически невыносима сама мысль о гарантированной
            потере — и мы охотнее идём на риск, лишь бы был шанс вообще не потерять ничего, даже
            если статистически шансы одинаковы. Гарантированная потеря «болит» сильнее, чем такая
            же по размеру гарантированная недополученная выгода — из-за этого одна и та же дилемма
            выглядит совершенно по-разному в зависимости от того, с какой стороны на неё
            посмотреть.
          </p>

          <h2>Ещё немного фактов</h2>

          <ol class="step-list">
            <li>
              <div class="step-num">1</div>
              <div class="step-body">
                <b>Тот же приём — в маркетинге и медицине</b>
                <span
                  >«95% успешных операций» звучит убедительнее, чем «5% смертность» — хотя это одно
                  и то же число, поданное через выигрыш вместо потери.</span
                >
              </div>
            </li>
            <li>
              <div class="step-num">2</div>
              <div class="step-body">
                <b>Эффект устойчив даже у экспертов</b>
                <span
                  >Врачи в оригинальных репликах тоже меняли рекомендации в зависимости от
                  формулировки статистики выживаемости — специальные знания не отменяют эффект
                  фрейминга полностью.</span
                >
              </div>
            </li>
            <li>
              <div class="step-num">3</div>
              <div class="step-body">
                <b>Работает и на бытовых решениях</b>
                <span
                  >Люди чаще соглашаются на небольшую скидку за оплату наличными, если её называют
                  «скидкой», и заметно реже — если ровно ту же разницу в цене называют «доплатой за
                  оплату картой», хотя итоговая сумма одинакова.</span
                >
              </div>
            </li>
            <li>
              <div class="step-num">4</div>
              <div class="step-body">
                <b>Формулировки влияют на согласие с политикой и налогами</b>
                <span
                  >В опросах поддержка одной и той же меры заметно меняется в зависимости от того,
                  описана ли она как «сохранение существующих рабочих мест» или как «предотвращение
                  потери рабочих мест» — хотя по сути речь о совершенно одинаковом результате.</span
                >
              </div>
            </li>
            <li>
              <div class="step-num">5</div>
              <div class="step-body">
                <b>Рабочая параллель</b>
                <span
                  >«Мы можем сохранить 80% бюджета» и «мы потеряем 20% бюджета» — одно и то же
                  решение, но вторая формулировка обычно подталкивает команду к более рискованным
                  шагам, чтобы избежать ощущаемой потери.</span
                >
              </div>
            </li>
          </ol>

          <div class="nav-row">
            <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
            <span></span>
          </div>
          </div>
          ${this.flow.lock(5)}
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
