/* =========================================================
   PLAYERS ADMIN — the team-list panel on the home map
   =========================================================
   Who plays is managed here, not in the code: add a person, rename one (click the name),
   switch someone off for the day (the checkbox — they stay in the list), remove, paste a whole
   list, clear everyone, or fill in an example. Every change goes through logic/players.js (which
   keeps names trimmed and unique) and players-store.js (which remembers the list).

   A small helper owned by the home component — it keeps its own UI state (open, which name is
   being edited, the last error) and asks the host to re-render:

     this.players = new PlayersAdmin(this);   // constructor
     ${this.players.render()}                 // in the template
     this.players.problem()                   // why a game can't be started yet, or null
========================================================= */
import { html, nothing } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { confirmDialog } from './confirm-dialog.js';
import { ICON_CHEVRON_DOWN } from './icons.js';
import {
  activeNames,
  addMany,
  addPlayer,
  ERROR_TEXT,
  MAX_NAME,
  makePlayers,
  parseNames,
  removePlayer,
  renamePlayer,
  SAMPLE_PLAYERS,
  setActive,
  setAllActive,
  teamProblem,
} from './logic/players.js';
import { playersArePersisted, setPlayers, updatePlayers } from './players-store.js';
import { avatarHTML, state } from './state.js';
import { showToast } from './toast.js';

export class PlayersAdmin {
  constructor(host) {
    this.host = host;
    this.open = false;
    this.editing = null; // index of the name being edited
    this.error = null; // key of ERROR_TEXT for the add row / the edit field
    this.bulk = false; // the paste-a-list box is showing
  }

  problem() {
    return teamProblem(state.players);
  }

  // Opens the panel and puts the cursor in the add field — used when a game can't start yet.
  reveal() {
    this.open = true;
    this.host.requestUpdate();
    this.host.updateComplete.then(() =>
      this.host.renderRoot.getElementById('new-participant')?.focus(),
    );
  }

  _refresh() {
    this.host.requestUpdate();
  }

  _toggle() {
    this.open = !this.open;
    this._refresh();
  }

  _add() {
    const input = this.host.renderRoot.getElementById('new-participant');
    const r = updatePlayers((p) => addPlayer(p, input.value));
    this.error = r.error;
    if (!r.error) {
      input.value = '';
    }
    this._refresh();
    input.focus();
  }

  _addKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._add();
    } else if (this.error) {
      this.error = null;
      this._refresh();
    }
  }

  _remove(i) {
    if (this.editing === i) this.editing = null;
    updatePlayers((p) => ({ players: removePlayer(p, i) }));
    this._refresh();
  }

  _toggleActive(i, checked) {
    updatePlayers((p) => ({ players: setActive(p, i, checked) }));
    this._refresh();
  }

  _edit(i) {
    this.editing = i;
    this.error = null;
    this._refresh();
    this.host.updateComplete.then(() => {
      const el = this.host.renderRoot.getElementById('edit-player');
      el?.focus();
      el?.select();
    });
  }

  _commitEdit(i, value) {
    if (this.editing !== i) return;
    const r = updatePlayers((p) => renamePlayer(p, i, value));
    if (r.error && value.trim() !== state.players[i].name) {
      this.error = r.error; // stay in the field so it can be fixed
      this._refresh();
      return;
    }
    this.editing = null;
    this.error = null;
    this._refresh();
  }

  _editKey(e, i) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this._commitEdit(i, e.target.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.editing = null;
      this.error = null;
      this._refresh();
    }
  }

  _toggleBulk() {
    this.bulk = !this.bulk;
    this._refresh();
    if (this.bulk) {
      this.host.updateComplete.then(() =>
        this.host.renderRoot.getElementById('bulk-text')?.focus(),
      );
    }
  }

  _addBulk() {
    const box = this.host.renderRoot.getElementById('bulk-text');
    const names = parseNames(box.value);
    if (!names.length) {
      showToast('В списке нет имён');
      return;
    }
    const r = updatePlayers((p) => addMany(p, names));
    showToast(
      r.skipped
        ? `Добавлено ${r.added}, пропущено ${r.skipped} (повторы)`
        : `Добавлено игроков: ${r.added}`,
    );
    box.value = '';
    this.bulk = false;
    this._refresh();
  }

  _sample() {
    setPlayers(makePlayers(SAMPLE_PLAYERS));
    this._refresh();
  }

  async _clear() {
    const ok = await confirmDialog({
      title: 'Удалить всех игроков?',
      message: 'Список станет пустым. Добавить людей можно будет заново.',
      confirmLabel: 'Удалить',
      cancelLabel: 'Отмена',
    });
    if (!ok) return;
    this.editing = null;
    setPlayers([]);
    this._refresh();
  }

  _row(player, i) {
    const editing = this.editing === i;
    return html`
      <li class="player-row ${player.active ? '' : 'off'}" data-testid="player-row">
        <input
          type="checkbox"
          class="player-active"
          .checked=${player.active}
          aria-label="Играет сегодня: ${player.name}"
          title=${player.active ? 'Играет сегодня' : 'Сегодня не играет'}
          @change=${(e) => this._toggleActive(i, e.target.checked)}
        />
        ${unsafeHTML(avatarHTML(player.name))}
        ${
          editing
            ? html`<input
                id="edit-player"
                class="player-edit"
                type="text"
                maxlength=${MAX_NAME + 20}
                .value=${player.name}
                aria-label="Новое имя для ${player.name}"
                @keydown=${(e) => this._editKey(e, i)}
                @blur=${(e) => this._commitEdit(i, e.target.value)}
              />`
            : html`<button
                type="button"
                class="player-name"
                title="Нажмите, чтобы переименовать"
                @click=${() => this._edit(i)}
              >
                ${player.name}
              </button>`
        }
        <button
          type="button"
          class="player-x"
          aria-label="Удалить ${player.name}"
          @click=${() => this._remove(i)}
        >
          ×
        </button>
      </li>
    `;
  }

  render() {
    const players = state.players;
    const playing = activeNames(players).length;
    const problem = this.problem();
    return html`
      <div class="hud-card roster-panel players-admin ${this.open ? 'open' : ''}" data-testid="players-admin">
        <button type="button" class="roster-toggle" aria-expanded=${this.open ? 'true' : 'false'} @click=${() => this._toggle()}>
          <span class="badge">${playing}</span>
          <span class="roster-toggle-label">Игроки</span>
          <span class="roster-chevron">${unsafeHTML(ICON_CHEVRON_DOWN)}</span>
        </button>
        <div class="roster-body">
          <div class="roster-body-inner">
            <div class="panel-head">
              <h2>Игроки</h2>
              <span class="count" data-testid="players-count">${
                players.length && playing !== players.length
                  ? `играют ${playing} из ${players.length}`
                  : `${players.length} человек`
              }</span>
            </div>

            <div class="add-row">
              <input
                type="text"
                id="new-participant"
                placeholder="Имя игрока"
                maxlength=${MAX_NAME + 20}
                aria-label="Имя нового игрока"
                aria-invalid=${this.error && this.editing === null ? 'true' : 'false'}
                @keydown=${(e) => this._addKey(e)}
              />
              <button class="primary" id="add-participant-btn" @click=${() => this._add()}>
                Добавить
              </button>
            </div>
            <p class="players-error" role="alert" data-testid="players-error">${
              this.error ? ERROR_TEXT[this.error] : ''
            }</p>

            ${
              players.length
                ? html`<ul class="player-list">
                    ${players.map((p, i) => this._row(p, i))}
                  </ul>`
                : html`<div class="players-empty" data-testid="players-empty">
                    <b>Пока никого нет</b>
                    <span>Добавьте игроков по одному или вставьте список — тогда можно начинать.</span>
                  </div>`
            }

            ${
              this.bulk
                ? html`<div class="bulk-box">
                    <textarea
                      id="bulk-text"
                      rows="5"
                      placeholder="По одному имени в строке — или через запятую"
                      aria-label="Список игроков"
                    ></textarea>
                    <div class="bulk-actions">
                      <button class="primary" id="bulk-add-btn" @click=${() => this._addBulk()}>Добавить всех</button>
                      <button type="button" class="link-btn" @click=${() => this._toggleBulk()}>Отмена</button>
                    </div>
                  </div>`
                : nothing
            }

            <div class="players-tools">
              <button type="button" class="link-btn" id="bulk-toggle-btn" @click=${() => this._toggleBulk()}>Вставить списком</button>
              ${
                players.length === 0
                  ? html`<button type="button" class="link-btn" id="sample-btn" @click=${() => this._sample()}>Заполнить примером</button>`
                  : html`
                      ${
                        playing < players.length
                          ? html`<button type="button" class="link-btn" id="all-in-btn" @click=${() => {
                              setPlayers(setAllActive(state.players, true));
                              this._refresh();
                            }}>Играют все</button>`
                          : nothing
                      }
                      <button type="button" class="link-btn danger" id="clear-players-btn" @click=${() => this._clear()}>Удалить всех</button>
                    `
              }
            </div>

            ${
              problem && players.length
                ? html`<p class="players-note warn" data-testid="players-problem">${problem}</p>`
                : nothing
            }
            ${
              playersArePersisted()
                ? nothing
                : html`<p class="players-note" data-testid="players-unsaved">Браузер не сохраняет список — после перезагрузки он пропадёт.</p>`
            }
          </div>
        </div>
      </div>
    `;
  }
}
