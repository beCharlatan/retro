/* =========================================================
   HOME VIEW

   Lit/Shadow DOM component (docs/modernization-plan.md Phase 4) —
   `<retro-home>`, same pattern as every game (declarative html``
   template + reactive state instead of the old imperative
   innerHTML-string rebuilding). `renderHome()` stays exported as a
   thin mount wrapper — every game's back-link handler and app.js's
   boot call use it exactly like before, they don't need to know it's
   a custom element underneath.

   `state.filter`/`state.structureFilter` (state.js) are read/written
   directly here, same as `state.participants` — NOT mirrored into
   Lit reactive properties, and deliberately so: a `<retro-home>`
   instance is destroyed and recreated every time a game's back-link
   returns here (`renderHome()` always mounts a fresh element), so any
   *component-local* reactive property would silently reset to its
   default on every return trip. A facilitator who filtered to one
   category, opened a game, and came back should still see that same
   filter applied — this bit me once already (a first draft moved
   filter/structureFilter into component-local state and
   test/home.spec.js's "random game respects the active category
   filter" check caught the regression: the filter appeared to work
   per-click, but silently reset on every "← Все игры"). Every mutating
   handler below calls `this.requestUpdate()` manually instead of
   relying on Lit's property-change detection, exactly like the
   participants add/remove handlers already did.
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { openGame } from './router.js';
import { app, avatarHTML, CATEGORY, GAMES, STRUCTURE, state } from './state.js';
import { sharedStyles } from './styles/shared-styles.js';
import { showToast } from './toast.js';

const CAT_FILTERS = [
  { id: 'all', label: 'Все' },
  ...Object.keys(CATEGORY).map((k) => ({ id: k, label: CATEGORY[k].label })),
];
const STRUCT_FILTERS = [
  { id: 'all', label: 'Все' },
  ...Object.keys(STRUCTURE).map((k) => ({ id: k, label: STRUCTURE[k].label })),
];

export class RetroHome extends LitElement {
  static styles = sharedStyles;

  static properties = {
    openTeaserIds: { state: true },
  };

  constructor() {
    super();
    this.openTeaserIds = new Set();
  }

  _setFilter(id) {
    state.filter = id;
    this.requestUpdate();
  }

  _setStructureFilter(id) {
    state.structureFilter = id;
    this.requestUpdate();
  }

  _filteredGames() {
    return GAMES.filter(
      (g) =>
        (state.filter === 'all' || g.category === state.filter) &&
        (state.structureFilter === 'all' || g.structure === state.structureFilter),
    );
  }

  _pickRandomGame() {
    const pool = this._filteredGames().filter((g) => g.ready);
    if (!pool.length) {
      showToast('Нет доступных игр с такими фильтрами');
      return;
    }
    const g = pool[Math.floor(Math.random() * pool.length)];
    openGame(g.id);
  }

  _addParticipant() {
    const input = this.renderRoot.getElementById('new-participant');
    const v = input.value.trim();
    if (!v) return;
    state.participants.push(v);
    input.value = '';
    this.requestUpdate();
  }

  _onNewParticipantKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._addParticipant();
    }
  }

  _removeParticipant(i) {
    state.participants.splice(i, 1);
    this.requestUpdate();
  }

  _toggleTeaser(id) {
    const next = new Set(this.openTeaserIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.openTeaserIds = next;
  }

  _openGame(g) {
    if (g.ready) openGame(g.id);
    else showToast(`«${g.name}» скоро добавим`);
  }

  _filterPills(options, active, onSelect) {
    return options.map(
      (f) => html`
        <button
          class="filter-pill ${active === f.id ? 'active' : ''}"
          @click=${() => onSelect(f.id)}
        >
          ${f.label}
        </button>
      `,
    );
  }

  _gameCard(g, index) {
    const cat = CATEGORY[g.category];
    const teaserOpen = this.openTeaserIds.has(g.id);
    return html`
      <div
        class="game-card ${g.ready ? '' : 'disabled'}"
        style="--cat-color:${cat.color};--cat-bg:${cat.pillBg}"
        @click=${() => this._openGame(g)}
      >
        <div class="top-row">
          <span class="icon">${g.icon}</span>
          <div class="top-row-right">
            <span class="year">№ ${String(index + 1).padStart(2, '0')}</span>
            ${g.ready ? '' : html`<span class="status soon">Скоро</span>`}
          </div>
        </div>
        <p class="name">${g.name}</p>
        <button
          type="button"
          class="teaser-toggle"
          @click=${(e) => {
            e.stopPropagation();
            this._toggleTeaser(g.id);
          }}
        >
          <span class="toggle-label">${teaserOpen ? 'Скрыть' : 'Что это?'}</span>
          <span class="chev">▾</span>
        </button>
        <p class="teaser" ?hidden=${!teaserOpen}>${g.teaser}</p>
        <div class="meta">
          <span class="cat-tag">${cat.label}</span>
          <span>·</span>
          <span>${g.players}</span>
          <span>·</span>
          <span>${g.time}</span>
        </div>
      </div>
    `;
  }

  render() {
    const list = this._filteredGames();

    return html`
      <div class="wrap">
        <div class="masthead">
          <h1>5 минут общего развития</h1>
          <p class="lede">
            Экономика и психология решений — в формате коротких командных игр. Инструкция, форма,
            живой результат вашей команды, а потом — история и разбор эффекта.
          </p>
          <div class="masthead-rule">
            <span class="colophon"><b>${GAMES.length}</b> экспериментов</span>
            <span class="colophon">когнитивная психология · теория игр</span>
            <span class="colophon">составлено для командных встреч</span>
          </div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <h2>Участники</h2>
            <span class="count">${state.participants.length} человек</span>
          </div>
          <div class="chips">
            ${state.participants.map(
              (name, i) => html`
                <span class="chip">
                  ${unsafeHTML(avatarHTML(name))}${name}
                  <button
                    class="chip-x"
                    aria-label="Удалить ${name}"
                    @click=${() => this._removeParticipant(i)}
                  >
                    ×
                  </button>
                </span>
              `,
            )}
          </div>
          <div class="add-row">
            <input
              type="text"
              id="new-participant"
              placeholder="Имя участника"
              @keydown=${(e) => this._onNewParticipantKeydown(e)}
            />
            <button class="primary" id="add-participant-btn" @click=${() => this._addParticipant()}>
              Добавить
            </button>
          </div>
        </div>

        <div class="filter-group">
          <span class="filter-label">Категория</span>
          <div class="filters">
            ${this._filterPills(CAT_FILTERS, state.filter, (id) => this._setFilter(id))}
          </div>
        </div>

        <div class="toolbar-row">
          <div class="filter-group">
            <span class="filter-label">Участники</span>
            <div class="filters">
              ${this._filterPills(STRUCT_FILTERS, state.structureFilter, (id) =>
                this._setStructureFilter(id),
              )}
            </div>
          </div>
          <button class="shuffle-btn" id="random-game-btn" @click=${() => this._pickRandomGame()}>
            🎲 Случайная игра
          </button>
        </div>

        <div class="game-grid">
          ${
            list.length
              ? list.map((g) => this._gameCard(g, GAMES.indexOf(g)))
              : html`<p class="note" style="grid-column:1/-1;">
                Нет игр с такими фильтрами — попробуйте сбросить один из них.
              </p>`
          }
        </div>
      </div>
    `;
  }
}

customElements.define('retro-home', RetroHome);

export function renderHome() {
  app.replaceChildren(document.createElement('retro-home'));
}
