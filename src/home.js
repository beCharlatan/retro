/* =========================================================
   HOME VIEW — gamified map (branch `gme`)

   Replaces the old card-grid home screen with a D3-powered map where
   every game is a free-drifting, spinning icon (see docs/
   modernization-plan.md's "Гейм-карта" entry for the full rationale).
   Same split as any pairs/groups game and roles.js: this file is the
   Lit/Shadow DOM component (HUD chrome — masthead, floating
   participants panel, floating filter toolbar, shuffle button, and the
   agenda panel for whichever game is currently selected) declared with
   reactive `html``` templates; all the D3/physics/camera work (motion,
   the location buttons themselves, focus/unfocus/dive) lives in
   map-render.js's createMap(), owned imperatively and only ever
   touched from firstUpdated()/updated() below — Lit's own render()
   must never re-render into #map-canvas, or it would fight the physics
   loop for control of that DOM.

   `renderHome()` stays the same exported thin mount wrapper every
   game's back-link already calls — nothing about that contract
   changed, so no other file needed to change its import.

   `state.filter`/`state.structureFilter` are still read/written
   directly on the shared `state` module (not mirrored into Lit
   reactive properties) for the exact same reason as before: a
   <retro-home> instance is destroyed and recreated every time a game's
   back-link returns here, so component-local state would silently
   reset. `selectedGame` (below) is the opposite case on purpose — it's
   what's currently open in the agenda panel, which should NOT survive
   a return trip from a game, so it's a plain Lit reactive property.
========================================================= */
import { html, LitElement } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { ICON_CHEVRON_DOWN, ICON_SURPRISE, ICON_X } from './icons.js';
import {
  countForCategory as countCategory,
  countForStructure as countStructure,
  filterOptions,
  filtersActive as filtersAreActive,
  matchesFilters as matchesGame,
} from './logic/filters.js';
import { createMap, PALETTE } from './map-render.js';
import { openGame } from './router.js';
import { app, avatarHTML, CATEGORY, GAMES, STRUCTURE, state } from './state.js';
import { mapStyles } from './styles/map-styles.js';
import { showToast } from './toast.js';

const CAT_FILTERS = filterOptions(CATEGORY);
const STRUCT_FILTERS = filterOptions(STRUCTURE);

// The current filter values, as the pure functions in logic/filters.js want them.
const currentFilters = () => ({ category: state.filter, structure: state.structureFilter });
const matchesFilters = (g) => matchesGame(g, currentFilters());
const filtersActive = () => filtersAreActive(currentFilters());
const countForCategory = (catId) => countCategory(GAMES, catId, currentFilters());
const countForStructure = (structId) => countStructure(GAMES, structId, currentFilters());

export class RetroHome extends LitElement {
  static styles = mapStyles;

  static properties = {
    rosterOpen: { state: true },
    selectedGame: { state: true },
  };

  constructor() {
    super();
    // Collapsed by default — the roster already has everyone from last
    // time (state.participants persists), so there's no first-load
    // reason to spend a big chunk of the map's corner on it; also
    // leaves more of the canvas clear of HUD chrome for the location
    // layout to fit into without overlapping a card (see map-render.js's
    // SAFE_INSET).
    this.rosterOpen = false;
    this.selectedGame = null;
    this._mapController = null;
  }

  // D3 owns #map-canvas from here on — created once, never touched by
  // Lit's own render() again. See this file's header comment.
  firstUpdated() {
    const canvas = this.renderRoot.getElementById('map-canvas');
    this._mapController = createMap(canvas, {
      onOpenGame: (id) => openGame(id),
      onSelect: (g) => {
        this.selectedGame = g;
      },
    });
    this._mapController.updateHighlight(matchesFilters, filtersActive());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._mapController?.destroy();
  }

  _setFilter(id) {
    state.filter = id;
    this._mapController?.updateHighlight(matchesFilters, filtersActive());
    this.requestUpdate();
  }

  _setStructureFilter(id) {
    state.structureFilter = id;
    this._mapController?.updateHighlight(matchesFilters, filtersActive());
    this.requestUpdate();
  }

  // "Случайная игра": fly to a random (filtered, ready) game exactly
  // like clicking it would — agenda panel and all — hold briefly, then
  // dive in and start it via the exact same path the panel's own
  // "Начать игру" button uses. See map-render.js's focusAndAutoStart().
  _pickRandomGame() {
    const pool = GAMES.filter((g) => matchesFilters(g) && g.ready);
    if (!pool.length) {
      showToast('Нет доступных игр с такими фильтрами');
      return;
    }
    const g = pool[Math.floor(Math.random() * pool.length)];
    this._mapController?.focusAndAutoStart(g.id, 3000);
  }

  _closeAgenda() {
    this._mapController?.unfocus();
  }

  _startSelectedGame() {
    if (this.selectedGame) this._mapController?.startGame(this.selectedGame.id);
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

  _toggleRoster() {
    this.rosterOpen = !this.rosterOpen;
  }

  _filterPills(options, active, onSelect, countFn) {
    return options.map(
      (f) => html`
        <button
          class="filter-pill ${active === f.id ? 'active' : ''}"
          @click=${() => onSelect(f.id)}
        >
          ${f.label}<span class="filter-count">(${countFn(f.id)})</span>
        </button>
      `,
    );
  }

  // One persistent structure for both states (not two templates Lit
  // swaps between) — a `.roster-body` that's always in the DOM but
  // collapses via a `grid-template-rows: 0fr -> 1fr` transition (the
  // standard CSS-only way to animate to/from an intrinsic height
  // without JS measuring anything) is what makes the reveal an actual
  // animation instead of an instant swap. The toggle header (count
  // badge + chevron) stays visible in both states and is the only
  // "collapse" control now — the old second "Свернуть" button inside
  // the expanded body was redundant with it.
  _rosterPanel() {
    return html`
      <div class="hud-card roster-panel ${this.rosterOpen ? 'open' : ''}">
        <button type="button" class="roster-toggle" @click=${() => this._toggleRoster()}>
          <span class="badge">${state.participants.length}</span>
          <span class="roster-toggle-label">Участники</span>
          <span class="roster-chevron">${unsafeHTML(ICON_CHEVRON_DOWN)}</span>
        </button>
        <div class="roster-body">
          <div class="roster-body-inner">
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
              <button
                class="primary"
                id="add-participant-btn"
                @click=${() => this._addParticipant()}
              >
                Добавить
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // The full-detail card the camera's fly-to always lands next to —
  // name, description, category/players/format/time, and the one
  // button that actually starts the game (a plain click on the icon
  // only selects/focuses it, see map-render.js).
  _agendaPanel() {
    const g = this.selectedGame;
    if (!g) return '';
    const cat = CATEGORY[g.category];
    const palette = PALETTE[g.category];
    return html`
      <div class="hud-card agenda-panel" style="--loc-color:${palette.color}">
        <button
          type="button"
          class="agenda-close"
          aria-label="Закрыть"
          @click=${() => this._closeAgenda()}
        >
          ${unsafeHTML(ICON_X)}
        </button>
        <span class="agenda-cat">${cat.label}</span>
        <h3>${g.name}</h3>
        <p>${g.teaser}</p>
        <div class="agenda-meta">
          <div>
            <span class="agenda-meta-label">Участники</span>
            <span class="agenda-meta-value">${g.players}</span>
          </div>
          <div>
            <span class="agenda-meta-label">Формат</span>
            <span class="agenda-meta-value">${STRUCTURE[g.structure].label}</span>
          </div>
          <div>
            <span class="agenda-meta-label">Время</span>
            <span class="agenda-meta-value">${g.time}</span>
          </div>
        </div>
        <button type="button" class="agenda-start" @click=${() => this._startSelectedGame()}>
          Начать игру
        </button>
      </div>
    `;
  }

  render() {
    return html`
      <div class="masthead">
        <h1>5 минут общего развития</h1>
        <p class="lede">Выберите локацию на карте — коротких командных экспериментов ${GAMES.length}.</p>
      </div>

      ${this._rosterPanel()}

      <div class="hud-card filter-toolbar">
        <div>
          <span class="filter-label">Категория</span>
          <div class="filters">
            ${this._filterPills(
              CAT_FILTERS,
              state.filter,
              (id) => this._setFilter(id),
              countForCategory,
            )}
          </div>
        </div>
        <div>
          <span class="filter-label">Участники</span>
          <div class="filters">
            ${this._filterPills(
              STRUCT_FILTERS,
              state.structureFilter,
              (id) => this._setStructureFilter(id),
              countForStructure,
            )}
          </div>
        </div>
      </div>

      <button class="shuffle-btn" id="random-game-btn" @click=${() => this._pickRandomGame()}>
        ${unsafeHTML(ICON_SURPRISE)} Случайная игра
      </button>

      <div class="zoom-hint">Нажмите на иконку, чтобы узнать об игре и начать</div>

      ${this._agendaPanel()}

      <div id="map-canvas"></div>
    `;
  }
}

customElements.define('retro-home', RetroHome);

export function renderHome() {
  app.replaceChildren(document.createElement('retro-home'));
}
