/* =========================================================
   GAME: Кто возьмёт на себя (volunteer)
   The volunteer's dilemma in three rounds of growing groups —
   pairs, fours, the whole team. Someone has to take the "incident";
   if anyone does, the whole group is fine and the volunteer pays for
   it; if nobody does, everyone loses. The results put the team's own
   volunteering rate next to Diekmann's equilibrium for the same group
   sizes: the bystander effect, measured on themselves.

   Groups are drawn once when the game opens (and kept in the draft),
   shown on the projector before each round — people must know how
   many others "see the fire".
========================================================= */

import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { drawLines } from '../charts/lines.js';
import CONTENT from '../content/volunteer.json';
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
  splitIntoGroups,
  VD_BENEFIT,
  VD_COST,
  VD_GROUP_SIZES,
  VD_ROUNDS,
  vdTheory,
  volunteerResults,
  volunteerRound,
} from '../logic/volunteer.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { Roles } from '../roles.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const GAME_ID = 'volunteer';
const ROUND_TIMER_SECONDS = 15;
const RESULTS = VD_ROUNDS + 1;
const CONTEXT = VD_ROUNDS + 2;
const TOTAL_SCREENS = VD_ROUNDS + 3;
const ROUNDS = [
  {
    short: 'Пары',
    title: 'В парах',
    scenario: 'Упал CI у вас двоих. Кто-то должен разобраться: это час работы вместо своей задачи.',
  },
  {
    short: 'Четвёрки',
    title: 'В четвёрках',
    scenario: 'Клиент пишет в общий канал вашей четвёрки. Ответить — значит взять тикет на себя.',
  },
  {
    short: 'Вся команда',
    title: 'Всей командой',
    scenario: 'Пятница, 18:55. Алерт в общем канале команды: падает прод.',
  },
];
const ROUND_TITLES = [
  'Кто возьмёт на себя — правила',
  ...ROUNDS.map((r, i) => `Раунд ${i + 1}: ${r.title.toLowerCase()}`),
  'Что получилось у вашей команды',
  'Кто возьмёт на себя',
];
const VARS = { benefit: VD_BENEFIT, cost: VD_COST, volunteerPay: VD_BENEFIT - VD_COST };

export class RetroGameVolunteer extends LitElement {
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
    this.groupsByRound = this._drawGroups();
    this.data = this._blankData();
    this.results = null;
    this.charts = new ChartController(this, [
      {
        id: 'vd-chart',
        when: () => this.results,
        draw: (svg, theme) => this._drawChart(svg, theme),
      },
    ]);
    this.timers = new RoundTimers(this, { seconds: ROUND_TIMER_SECONDS, count: VD_ROUNDS });
    this.projector = new ProjectorController(this, GAME_ID, {
      roster: (screen) => this._projectorRoster(screen),
      entries: (screen) => this._projectorEntries(screen),
    });
    this.draft = loadableDraft(Persist.load(GAME_ID), {
      key: 'data',
      length: this.names.length,
      requires: 'groupsByRound',
    });
  }

  _drawGroups() {
    return VD_GROUP_SIZES.map((size) => splitIntoGroups(Roles.shuffle(this.names), size));
  }

  _blankData() {
    return this.names.map((name) => ({ name, choices: Array(VD_ROUNDS).fill(null) }));
  }

  _save() {
    Persist.save(GAME_ID, { data: this.data, groupsByRound: this.groupsByRound });
  }

  _restoreDraft() {
    this.flow.advance(1, () => {
      this.data = this.draft.payload.data;
      this.groupsByRound = this.draft.payload.groupsByRound;
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

  _reshuffle(round) {
    const next = this.groupsByRound.slice();
    next[round] = splitIntoGroups(Roles.shuffle(this.names), VD_GROUP_SIZES[round]);
    this.groupsByRound = next;
    this._save();
    this.requestUpdate();
  }

  _setChoice(name, round, choice) {
    const idx = this.data.findIndex((r) => r.name === name);
    const choices = this.data[idx].choices.slice();
    choices[round] = choices[round] === choice ? null : choice;
    this.data = patchRow(this.data, idx, { choices });
    this._save();
  }

  _projectorRoster(screen) {
    if (screen < 1 || screen > VD_ROUNDS) return null;
    const groups = this.groupsByRound[screen - 1];
    if (groups.length < 2) return null; // the whole team: no split to show
    return {
      kind: 'groups',
      title: 'Кто с кем в группе',
      groups: groups.map((names, i) => ({
        label: `Группа ${i + 1}`,
        tone: i % 2 ? 'b' : 'a',
        names,
      })),
    };
  }

  // Only how many answered — who volunteered stays secret until the round is over.
  _projectorEntries(screen) {
    if (screen < 1 || screen > VD_ROUNDS) return null;
    const round = screen - 1;
    return projectorEntries({
      title: 'Решения (без имён и без ответов)',
      total: this.data.length,
      anonymous: true,
      rows: this.data.map((d) => ({
        complete: d.choices[round] !== null,
        cells: [{ label: 'Решение', value: d.choices[round] === null ? null : 'принято' }],
      })),
    });
  }

  _drawChart(svg, theme) {
    const rounds = this.results.rounds;
    const pick = (fn) => rounds.map((r) => (r ? fn(r) : null));
    drawLines(svg, {
      xLabels: ROUNDS.map(
        (r, i) => `${r.short} (~${rounds[i] ? Math.round(rounds[i].avgSize) : '?'})`,
      ),
      series: [
        { label: 'Вызвались', color: theme.accentDeep, values: pick((r) => r.volunteerRate) },
        {
          label: '…по теории',
          color: theme.accentDeep,
          values: pick((r) => r.theory.volunteer),
          dash: true,
        },
        { label: 'Не взялся никто', color: theme.red, values: pick((r) => r.nobodyRate) },
        { label: '…по теории', color: theme.red, values: pick((r) => r.theory.nobody), dash: true },
      ],
      yDomain: [0, 100],
      format: (v) => `${v}%`,
      theme,
    });
  }

  _showResults() {
    this.results = volunteerResults(this.data, this.groupsByRound);
    ReportExport.register(
      GAME_ID,
      {
        subtitle: 'Чем больше людей видят проблему, тем меньше шанс, что её кто-то возьмёт.',
        meta: ReportExport.meta(this.data.length, 'пары → четвёрки → вся команда'),
        explanation:
          'Дилемма добровольца (Diekmann, 1985): если вызвался хоть кто-то, выигрывают все, а сам доброволец платит. Чем больше группа, тем реже вызывается каждый. Эффект свидетеля показали Darley & Latané (1968): помогли 85% тех, кто думал, что слышит приступ один, и 31% — когда думали, что слушают ещё четверо.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.groupsByRound = this._drawGroups();
    this.data = this._blankData();
    this.results = null;
    Persist.clear(GAME_ID);
    this.timers.resetAll();
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  _recap(round) {
    const s = volunteerRound(this.data, this.groupsByRound[round], round);
    if (!s) return '';
    const saved = s.groups.filter((g) => g.saved).length;
    return html`
      <div class="round-recap" data-projector="body">
        <div class="round-recap-title">Как прошёл раунд ${round + 1}</div>
        <div class="round-recap-stats">
          <div class="round-recap-stat">
            <div class="n">${s.volunteerRate}%</div>
            <div class="lab">вызвались взять на себя</div>
          </div>
          <div class="round-recap-stat">
            <div class="n">${saved} из ${s.groups.length}</div>
            <div class="lab">${s.groups.length > 1 ? 'групп справились' : 'команда справилась'}</div>
          </div>
          <div class="round-recap-stat">
            <div class="n">${s.nobodyRate}%</div>
            <div class="lab">групп, где не взялся никто</div>
          </div>
        </div>
      </div>
    `;
  }

  _choiceRow(name, round) {
    const row = this.data.find((r) => r.name === name);
    const c = row.choices[round];
    return html`
      <div class="entry-row toggle-only">
        <div class="name">${unsafeHTML(avatarName(name))}</div>
        <div class="toggle-pair" role="group" aria-label="${name}: раунд ${round + 1}">
          <button type="button" class=${c === 'V' ? 'on' : ''} @click=${() => this._setChoice(name, round, 'V')}>Беру</button>
          <button type="button" class=${c === 'N' ? 'on' : ''} @click=${() => this._setChoice(name, round, 'N')}>Не беру</button>
        </div>
      </div>
    `;
  }

  _roundSection(round) {
    const screen = round + 1;
    const groups = this.groupsByRound[round];
    const filled = countFilled(this.data, (r) => r.choices[round] !== null);
    const last = round === VD_ROUNDS - 1;
    const info = ROUNDS[round];
    return html`
      <section class="${this.flow.roundClass(screen)}" id="round-${screen}">
        <div class="round-body">
          <p class="eyebrow" data-projector="eyebrow">Раунд ${screen} из ${VD_ROUNDS} · ${info.title.toLowerCase()}</p>
          <h2 data-projector="title">${info.scenario}</h2>
          <p class="lede" data-projector="lede">
            Если в группе кто-то скажет «Беру», все получат ${VD_BENEFIT}, а он сам — ${VD_BENEFIT - VD_COST}.
            Если не возьмётся никто, все получат 0.
          </p>
          ${round > 0 ? this._recap(round - 1) : ''}
          ${this.timers.card(round, { compact: true, runningLabel: 'на решение' })}

          ${groups.map(
            (names, gi) => html`
              <div class="entry-group">
                <div class="entry-head toggle-only">
                  <div>${groups.length > 1 ? `Группа ${gi + 1} · ${names.length} чел.` : `Вся команда · ${names.length} чел.`}</div>
                  <div>Решение</div>
                </div>
                <div data-testid="entry-body-${screen}-${gi}">${names.map((n) => this._choiceRow(n, round))}</div>
              </div>
            `,
          )}

          <div class="fill-progress">
            Заполнено: <span>${filled}</span> из <span>${this.names.length}</span>
            <div class="track"><div style="width:${(filled / this.names.length) * 100}%"></div></div>
          </div>

          <div class="nav-row">
            <button class="ghost" @click=${() => this.flow.scrollTo(screen - 1)}>${unsafeHTML(ICON_LEFT)} Назад</button>
            ${
              groups.length > 1 && filled === 0
                ? html`<button class="ghost" @click=${() => this._reshuffle(round)}>Перемешать группы</button>`
                : ''
            }
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
    const [pairs, , team] = r ? r.rounds : [];
    const contextVars = {
      ...VARS,
      nobodyTheoryPair: Math.round(vdTheory(2).nobody * 100),
      nobodyTheoryTeam: Math.round(vdTheory(this.names.length).nobody * 100),
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
                <p class="eyebrow" data-projector="eyebrow">Командное упражнение · 10 минут</p>
                <h1 data-projector="title">Кто возьмёт на себя</h1>
                <p class="lede">Три раунда, группы всё больше: пары, четвёрки, вся команда.</p>

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
                  <button class="primary" @click=${() => this.flow.advance(1)}>Раунд 1 ${unsafeHTML(ICON_RIGHT)}</button>
                </div>
              </div>
              ${this.flow.lock(0)}
            </section>

            ${ROUNDS.map((_, i) => this._roundSection(i))}

            <section class="${this.flow.roundClass(RESULTS)}" id="round-${RESULTS}">
              <div class="round-body">
                <p class="eyebrow" data-projector="eyebrow">Результаты</p>
                <h2 data-projector="title">Что получилось у вашей команды</h2>

                ${renderReveal({
                  value: pairs && team ? `${pairs.volunteerRate}% → ${team.volunteerRate}%` : '—',
                  ...REVEAL_COPY.volunteer(r),
                })}

                ${r ? renderLeaderboard({ rows: rankScores(r.people.map((p) => ({ name: p.name, score: p.total }))), unit: ['очко', 'очка', 'очков'] }) : ''}

                <div class="d3-chart-card" data-projector="chart">
                  <div class="d3-chart-title">Чем больше группа, тем реже берут на себя</div>
                  <svg id="vd-chart" class="d3-chart-svg" role="img" aria-label="Доля вызвавшихся и доля групп без добровольца по размеру группы, в сравнении с теорией"></svg>
                  <p class="d3-chart-cap">Сплошные линии — ваша команда, пунктир — равновесие Дикманна для групп того же размера (польза ${VD_BENEFIT}, цена ${VD_COST}). В скобках — средний размер группы.</p>
                </div>

                <table class="results-table">
                  <thead>
                    <tr>
                      <th>Участник</th>
                      ${ROUNDS.map((x) => html`<th>${x.short}</th>`)}
                      <th>Очки</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${
                      r
                        ? r.people.map(
                            (p) => html`
                              <tr>
                                <td class="name">${unsafeHTML(avatarName(p.name))}</td>
                                ${p.choices.map((c) => html`<td>${c === 'V' ? 'Беру' : c === 'N' ? 'Не беру' : '—'}</td>`)}
                                <td>${p.total}</td>
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
                  <button class="ghost" @click=${() => this.flow.scrollTo(VD_ROUNDS)}>${unsafeHTML(ICON_LEFT)} Назад</button>
                  <button class="primary" @click=${() => this.flow.advance(CONTEXT)}>Что это было? ${unsafeHTML(ICON_RIGHT)}</button>
                </div>
              </div>
              ${this.flow.lock(RESULTS)}
            </section>

            <section class="${this.flow.roundClass(CONTEXT)}" id="round-${CONTEXT}">
              <div class="round-body">
                <p class="eyebrow" data-projector="eyebrow">А теперь — контекст</p>
                <h1 data-projector="title">Кто возьмёт на себя</h1>
                ${renderContext(CONTENT.context, contextVars)}
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
            <div class="game-rail-title">Кто возьмёт на себя</div>
            ${renderTrail({ current: this.flow.activeRound, total: TOTAL_SCREENS, gameId: GAME_ID, stepLabels: ROUND_TITLES })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-volunteer', RetroGameVolunteer);
