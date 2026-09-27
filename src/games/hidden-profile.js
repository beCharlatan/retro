/* =========================================================
   GAME: Скрытый профиль (hidden-profile)
   Stasser & Titus (1985) as a hiring decision. Every person gets a
   different part of the dossier in a private message (the Раздача
   block: the facilitator copies each one into a DM), reads it for
   three minutes, closes the chat, votes alone — then the team
   discusses from memory and picks one finalist together. By any single
   dossier Саша looks best; by all of them together it is Женя. The
   reveal screen puts every fact on the projector with whose dossier it
   was in, so the team sees what they had between them all along.
========================================================= */

import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { drawBars } from '../charts/bars.js';
import CONTENT from '../content/hidden-profile.json';
import { renderContext, renderFacts, renderNote, renderRules, renderSteps } from '../content.js';
import { ChartController } from '../controllers/chart-controller.js';
import { ProjectorController } from '../controllers/projector-controller.js';
import { RoundFlowController } from '../controllers/round-flow-controller.js';
import { RoundTimers } from '../controllers/round-timers.js';
import { renderDispatch } from '../dispatch.js';
import { confirmExit, renderReveal } from '../game-shell.js';
import { gameAccentStyle, renderTrail } from '../game-trail.js';
import { renderHome } from '../home.js';
import { ICON_CLIPBOARD, ICON_DOWNLOAD, ICON_LEFT, ICON_RIGHT, ICON_X } from '../icons.js';
import { countFilled, hasEnough, loadableDraft, patchRow } from '../logic/entries.js';
import {
  HP_CANDIDATES,
  HP_CARDS,
  HP_SHARED,
  HP_UNIQUE_PLUSES,
  hiddenProfileResults,
  hpCardFor,
  hpMessage,
} from '../logic/hidden-profile.js';
import { projectorEntries } from '../logic/projector-entries.js';
import { percent } from '../logic/stats.js';
import { Persist, timeAgo } from '../persist.js';
import { ReportExport } from '../report-export.js';
import { REVEAL_COPY } from '../reveal-copy.js';
import { avatarName, state } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';

const GAME_ID = 'hidden-profile';
const READ_MINUTES = 3;
const TALK_MINUTES = 8;
const SCREEN = { intro: 0, dispatch: 1, vote: 2, talk: 3, dossier: 4, results: 5, context: 6 };
const TOTAL_SCREENS = 7;
const ROUND_TITLES = [
  'Скрытый профиль — правила',
  'Разошлите досье',
  'Личный голос',
  'Обсуждение и решение команды',
  'Что было в досье',
  'Что получилось у вашей команды',
  'Скрытый профиль',
];
const nameOf = (id) => HP_CANDIDATES.find((c) => c.id === id)?.name ?? '—';

export class RetroGameHiddenProfile extends LitElement {
  static styles = sharedStyles;

  static properties = {
    data: { state: true },
    draft: { state: true },
    results: { state: true },
    groupChoice: { state: true },
    surfaced: { state: true },
    sent: { state: true },
  };

  constructor() {
    super();
    this.names = state.participants.slice();
    this.flow = new RoundFlowController(this, { titles: ROUND_TITLES });
    this.data = this._blankData();
    this.groupChoice = null;
    this.surfaced = null; // null until the facilitator ticks the checklist; then 8 booleans
    this.sent = new Set();
    this.results = null;
    this.charts = new ChartController(this, [
      {
        id: 'hp-chart',
        when: () => this.results,
        draw: (svg, theme) => this._drawChart(svg, theme),
      },
    ]);
    // [0] reading the dossier, [1] the discussion
    this.timers = new RoundTimers(this, { seconds: READ_MINUTES * 60, count: 2 });
    this.timers.setDuration(1, TALK_MINUTES * 60);
    this.projector = new ProjectorController(this, GAME_ID, {
      entries: (screen) => this._projectorEntries(screen),
    });
    this.draft = loadableDraft(Persist.load(GAME_ID), { key: 'data', length: this.names.length });
  }

  _blankData() {
    return this.names.map((name, i) => ({ name, card: hpCardFor(i), vote: null }));
  }

  _save() {
    Persist.save(GAME_ID, {
      data: this.data,
      groupChoice: this.groupChoice,
      surfaced: this.surfaced,
      sent: [...this.sent],
    });
  }

  _restoreDraft() {
    this.flow.advance(SCREEN.dispatch, () => {
      const p = this.draft.payload;
      this.data = p.data;
      this.groupChoice = p.groupChoice ?? null;
      this.surfaced = p.surfaced ?? null;
      this.sent = new Set(p.sent ?? []);
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

  _setVote(idx, vote) {
    this.data = patchRow(this.data, idx, { vote: this.data[idx].vote === vote ? null : vote });
    this._save();
  }

  _setGroupChoice(id) {
    this.groupChoice = this.groupChoice === id ? null : id;
    this._save();
  }

  _toggleSurfaced(i) {
    const next = (this.surfaced ?? HP_UNIQUE_PLUSES.map(() => false)).slice();
    next[i] = !next[i];
    this.surfaced = next;
    this._save();
  }

  _projectorEntries(screen) {
    if (screen !== SCREEN.vote) return null;
    return projectorEntries({
      title: 'Личные голоса (без имён и без ответов)',
      total: this.data.length,
      anonymous: true,
      rows: this.data.map((d) => ({
        complete: d.vote !== null,
        cells: [{ label: 'Голос', value: d.vote ? 'принят' : null }],
      })),
    });
  }

  _drawChart(svg, theme) {
    const { soloVotes, total } = this.results;
    drawBars(svg, {
      bars: HP_CANDIDATES.map((c) => ({
        label: c.name,
        value: percent(soloVotes[c.id], total) ?? 0,
        color:
          c.id === 'zhenya' ? theme.accentDeep : c.id === 'sasha' ? theme.gold : theme.inkFaint,
        valueLabel: `${soloVotes[c.id]} из ${total}`,
        tip: `<b>${c.name}</b> — ${soloVotes[c.id]} из ${total} личных голосов`,
      })),
      domain: [0, 100],
      theme,
    });
  }

  _showResults() {
    const surfaced = this.surfaced ? this.surfaced.filter(Boolean).length : null;
    this.results = hiddenProfileResults(this.data, this.groupChoice, surfaced);
    ReportExport.register(
      GAME_ID,
      {
        subtitle:
          'Группы обсуждают то, что и так знают все, и не узнают то, что знает кто-то один.',
        meta: ReportExport.meta(this.data.length, `${HP_CARDS.length} разных досье`),
        explanation:
          'Скрытый профиль (Stasser & Titus, 1985): лучший вариант виден только если сложить знания всех участников. Когда вся информация была у всех, 83% групп выбирали лучшего кандидата; когда его плюсы были разложены по людям — только 18%.',
      },
      this.renderRoot,
    );
  }

  async _reset() {
    this.data = this._blankData();
    this.groupChoice = null;
    this.surfaced = null;
    this.sent = new Set();
    this.results = null;
    Persist.clear(GAME_ID);
    this.timers.resetAll();
    this.timers.setDuration(1, TALK_MINUTES * 60);
    this.flow.reset();
    await this.updateComplete;
    this.flow.scrollTo(0);
  }

  _candidateToggle(current, onPick, label) {
    return html`
      <div class="toggle-pair multi" role="group" aria-label=${label}>
        ${HP_CANDIDATES.map(
          (c) =>
            html`<button type="button" class=${current === c.id ? 'on' : ''} @click=${() => onPick(c.id)}>${c.name}</button>`,
        )}
      </div>
    `;
  }

  _dossierTable() {
    const rows = HP_CANDIDATES.flatMap((c) => [
      ...HP_SHARED[c.id].map((f) => ({
        c,
        sign: f.sign,
        text: f.text,
        where: 'у всех',
        unique: false,
      })),
      ...HP_CARDS.flatMap((card, k) => {
        const own = c.id === 'zhenya' ? card.zhenya : c.id === 'sasha' ? [card.sasha] : [];
        return own.map((text) => ({
          c,
          sign: c.id === 'zhenya' ? 1 : -1,
          text,
          where: `только досье №${k + 1}`,
          unique: true,
        }));
      }),
    ]);
    return html`
      <table class="payoff-table dossier-table" data-projector="body">
        <thead>
          <tr><th>Кандидат</th><th aria-label="Плюс или минус">±</th><th>Факт</th><th>У кого был</th></tr>
        </thead>
        <tbody>
          ${rows.map(
            (r) => html`
              <tr class=${r.unique ? 'unique' : ''}>
                <td>${r.c.name}</td>
                <td>${r.sign > 0 ? '＋' : '−'}</td>
                <td>${r.text}</td>
                <td>${r.where}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
  }

  _section(idx, body) {
    return html`
      <section class="${this.flow.roundClass(idx)}" id="round-${idx}">
        <div class="round-body">${body}</div>
        ${this.flow.lock(idx)}
      </section>
    `;
  }

  _nav(idx, { next, label, disabled = false, action } = {}) {
    return html`
      <div class="nav-row">
        ${idx > 0 ? html`<button class="ghost" @click=${() => this.flow.scrollTo(idx - 1)}>${unsafeHTML(ICON_LEFT)} Назад</button>` : html`<span></span>`}
        <button
          class="primary"
          data-testid="next-btn-${idx}"
          ?disabled=${disabled}
          @click=${() => {
            this.timers.reset();
            this.flow.advance(next, action);
          }}
        >
          ${label} ${unsafeHTML(ICON_RIGHT)}
        </button>
      </div>
    `;
  }

  render() {
    const r = this.results;
    const votes = countFilled(this.data, (d) => d.vote !== null);
    const surfacedCount = this.surfaced ? this.surfaced.filter(Boolean).length : null;
    const dispatchRows = this.data.map((d) => ({
      name: d.name,
      tag: `Досье №${d.card + 1} · ${HP_CARDS[d.card].title}`,
      text: hpMessage(d.card, READ_MINUTES),
    }));
    return html`
      <div class="wrap-wide" style=${gameAccentStyle(GAME_ID)}>
        <retro-projector-button></retro-projector-button>
        <button type="button" class="game-exit" aria-label="Выйти из игры" @click=${() => confirmExit(() => this._goHome())}>
          ${unsafeHTML(ICON_X)}
        </button>

        <div class="game-shell">
          <div class="game-main">
            ${this._section(
              SCREEN.intro,
              html`
                <p class="eyebrow" data-projector="eyebrow">Командное упражнение · 20 минут</p>
                <h1 data-projector="title">Скрытый профиль</h1>
                <p class="lede">Нанимаем старшего разработчика. Три финалиста, у каждого из вас — своя часть досье.</p>
                ${renderRules(CONTENT.rules, { minutes: TALK_MINUTES })}

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
                ${renderSteps(CONTENT.intro.steps, { minutes: TALK_MINUTES })}
                ${renderNote(CONTENT.intro.note)}
                ${this._nav(SCREEN.intro, { next: SCREEN.dispatch, label: 'Разослать досье' })}
              `,
            )}

            ${this._section(
              SCREEN.dispatch,
              html`
                <p class="eyebrow" data-projector="eyebrow">Шаг 1 · досье</p>
                <h2 data-projector="title" data-projector-text="Читаем досье в личке — 3 минуты, потом закрываем чат">Разошлите каждому его досье</h2>
                <p class="lede">
                  Досье ${HP_CARDS.length} разных, они раздаются по кругу. Когда все получили — запустите таймер чтения.
                </p>
                ${renderDispatch({
                  title: 'Раздача · досье',
                  rows: dispatchRows,
                  sent: this.sent,
                  onSent: (name) => {
                    this.sent = new Set(this.sent).add(name);
                    this._save();
                  },
                })}
                ${this.timers.card(0, { compact: true, runningLabel: 'на чтение' })}
                ${this._nav(SCREEN.dispatch, { next: SCREEN.vote, label: 'Все прочитали' })}
              `,
            )}

            ${this._section(
              SCREEN.vote,
              html`
                <p class="eyebrow" data-projector="eyebrow">Шаг 2 · личный голос</p>
                <h2 data-projector="title" data-projector-text="Кого бы вы взяли сами? Напишите ведущему в личку">Впишите личный голос каждого</h2>
                <p class="lede">До обсуждения, тайно: кого человек взял бы сам.</p>
                <div class="entry-head choice-col"><div>Участник</div><div>Голос</div></div>
                <div data-testid="entry-body-${SCREEN.vote}">
                  ${this.data.map(
                    (d, i) => html`
                      <div class="entry-row choice-col">
                        <div class="name">${unsafeHTML(avatarName(d.name))}</div>
                        ${this._candidateToggle(d.vote, (id) => this._setVote(i, id), `${d.name}: личный голос`)}
                      </div>
                    `,
                  )}
                </div>
                <div class="fill-progress">
                  Заполнено: <span>${votes}</span> из <span>${this.names.length}</span>
                  <div class="track"><div style="width:${(votes / this.names.length) * 100}%"></div></div>
                </div>
                ${this._nav(SCREEN.vote, { next: SCREEN.talk, label: 'К обсуждению', disabled: !hasEnough(votes) })}
              `,
            )}

            ${this._section(
              SCREEN.talk,
              html`
                <p class="eyebrow" data-projector="eyebrow">Шаг 3 · обсуждение</p>
                <h2 data-projector="title">Кого берём: Сашу, Женю или Валю?</h2>
                <p class="lede" data-projector="lede">${TALK_MINUTES} минут, чтобы договориться об одном кандидате. Досье закрыты — только по памяти.</p>
                ${this.timers.card(1, { compact: true, runningLabel: 'на обсуждение' })}

                <h3>Решение команды</h3>
                ${this._candidateToggle(this.groupChoice, (id) => this._setGroupChoice(id), 'Решение команды')}

                <details class="check-list" ?open=${this.surfaced !== null}>
                  <summary>Необязательно: какие плюсы Жени прозвучали в обсуждении?</summary>
                  <p class="mini-note">Отметьте то, что кто-то назвал вслух. Это только для разбора — на проекторе не видно.</p>
                  ${HP_UNIQUE_PLUSES.map(
                    (f, i) => html`
                      <label class="check-row">
                        <input type="checkbox" .checked=${this.surfaced?.[i] ?? false} @change=${() => this._toggleSurfaced(i)} />
                        ${f.text} <span class="mini-note">(досье №${f.card + 1})</span>
                      </label>
                    `,
                  )}
                </details>

                ${this._nav(SCREEN.talk, { next: SCREEN.dossier, label: 'Открыть все досье', disabled: !this.groupChoice })}
              `,
            )}

            ${this._section(
              SCREEN.dossier,
              html`
                <p class="eyebrow" data-projector="eyebrow">Раскрытие</p>
                <h2 data-projector="title">Что было в досье у всех вместе</h2>
                <p class="lede" data-projector="lede">
                  Подсвечено то, что было только в одном досье. У Жени — 8 плюсов и 3 минуса, у Саши — 4 плюса и 4 минуса, у Вали — 3 и 2.
                </p>
                ${this._dossierTable()}
                ${this._nav(SCREEN.dossier, { next: SCREEN.results, label: 'Показать результаты', action: () => this._showResults() })}
              `,
            )}

            ${this._section(
              SCREEN.results,
              html`
                <p class="eyebrow" data-projector="eyebrow">Результаты</p>
                <h2 data-projector="title">Что получилось у вашей команды</h2>
                ${renderReveal({
                  value: r ? nameOf(r.groupChoice) : '—',
                  ...REVEAL_COPY.hiddenProfile(
                    r ? { ...r, groupName: nameOf(r.groupChoice) } : null,
                  ),
                })}
                <div class="d3-chart-card" data-projector="chart">
                  <div class="d3-chart-title">Личные голоса до обсуждения</div>
                  <svg id="hp-chart" class="d3-chart-svg" role="img" aria-label="Доля личных голосов за каждого кандидата"></svg>
                  <p class="d3-chart-cap">Каждый голосовал по своему досье. По любому отдельному досье сильнее всех выглядит Саша.</p>
                </div>
                <table class="results-table">
                  <thead><tr><th>Участник</th><th>Досье</th><th>Личный голос</th></tr></thead>
                  <tbody>
                    ${this.data.map(
                      (d) => html`
                        <tr>
                          <td class="name">${unsafeHTML(avatarName(d.name))}</td>
                          <td>№${d.card + 1} · ${HP_CARDS[d.card].title}</td>
                          <td>${nameOf(d.vote)}</td>
                        </tr>
                      `,
                    )}
                    <tr><td><b>Команда</b></td><td></td><td><b>${nameOf(this.groupChoice)}</b></td></tr>
                  </tbody>
                </table>
                <div class="export-row">
                  <button class="ghost" id="export-btn" @click=${(e) => ReportExport.download(e.currentTarget)}>
                    ${unsafeHTML(ICON_DOWNLOAD)} Сохранить результаты
                  </button>
                </div>
                ${this._nav(SCREEN.results, { next: SCREEN.context, label: 'Что это было?' })}
              `,
            )}

            ${this._section(
              SCREEN.context,
              html`
                <p class="eyebrow" data-projector="eyebrow">А теперь — контекст</p>
                <h1 data-projector="title">Скрытый профиль</h1>
                ${renderContext(
                  surfacedCount === null
                    ? {
                        ...CONTENT.context,
                        blocks: CONTENT.context.blocks.map((b) =>
                          b.stats
                            ? { stats: b.stats.filter((s) => !s.n.includes('{surfaced}')) }
                            : b,
                        ),
                      }
                    : CONTENT.context,
                  { surfaced: surfacedCount ?? '—' },
                )}
                <hr />
                <h2>Ещё немного фактов</h2>
                ${renderFacts(CONTENT.facts)}
                <div class="nav-row">
                  <button class="ghost" @click=${() => this._reset()}>↺ Начать заново</button>
                  <span></span>
                </div>
              `,
            )}
          </div>

          <aside class="game-rail">
            <div class="game-rail-title">Скрытый профиль</div>
            ${renderTrail({ current: this.flow.activeRound, total: TOTAL_SCREENS, gameId: GAME_ID, stepLabels: ROUND_TITLES })}
          </aside>
        </div>
      </div>
    `;
  }
}

customElements.define('retro-game-hidden-profile', RetroGameHiddenProfile);
