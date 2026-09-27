/* =========================================================
   ProjectorController — publishes what a game shows publicly
   =========================================================
   After every render it reads the active round's marked-public parts
   (projector/collect.js), builds a snapshot and hands it to the projector link, which
   sends it to the projector window if one is open. The picture is re-sent only when it
   changed; a chart still animating is waited for (and sent a moment later).

     constructor() { this.flow = …; this.charts = …; this.projector = new ProjectorController(this, 'anchoring'); }
     // games with groups or pairs: new ProjectorController(this, id, { roster: (round) => ({ kind, title, … }) })

   Create it AFTER the chart controller: controllers run in the order they were added, and
   the chart has to be drawn before it's copied. When the game leaves the page the projector
   is told to go back to its waiting screen.
========================================================= */
import { gameAccentStyle } from '../game-trail.js';
import { readBlocks, readTimer } from '../projector/collect.js';
import { projector as defaultLink } from '../projector/index.js';
import { idleSnapshot } from '../projector/snapshots.js';
import { GAMES, state } from '../state.js';

const SETTLE_RETRY_MS = 150;
const SETTLE_MAX_TRIES = 40; // ~6 s — longer than any chart animation

export class ProjectorController {
  constructor(host, gameId, { link = defaultLink, roster = null, entries = null } = {}) {
    this.host = host;
    this.gameId = gameId;
    this.gameName = GAMES.find((g) => g.id === gameId)?.name ?? gameId;
    this.link = link;
    this.roster = roster; // (roundIndex) => who is in which group/pair, or null
    this.entries = entries; // (roundIndex) => what has been entered so far, or null
    this._last = '';
    this._keep = { step: -1, charts: [] };
    this._retry = null;
    this._tries = 0;
    host.addController(this);
  }

  hostUpdated() {
    this._publish();
  }

  hostDisconnected() {
    clearTimeout(this._retry);
    this._last = '';
    this._keep = { step: -1, charts: [] };
    this.link.publish(idleSnapshot());
  }

  snapshot() {
    const { flow, renderRoot } = this.host;
    const i = flow.activeRound;
    const section = renderRoot?.getElementById(`round-${i}`);
    const step = { index: i, total: flow.titles.length, title: flow.titleOf(i) };
    const base = {
      kind: 'game',
      gameId: this.gameId,
      gameName: this.gameName,
      accent: gameAccentStyle(this.gameId),
      people: state.players.map((p) => p.name),
      step,
      timer: null,
      roster: null,
      entries: null,
      blocks: [],
    };
    // A round that isn't unlocked yet is blurred on the facilitator's screen; the room sees nothing of it.
    if (!section || flow.isLocked(i)) return { snapshot: base, pending: false };
    if (this._keep.step !== i) this._keep = { step: i, charts: [] };
    const { blocks, pending, charts } = readBlocks(section, this._keep.charts);
    this._keep.charts = charts;
    return {
      snapshot: {
        ...base,
        timer: readTimer(section),
        roster: this.roster?.(i) ?? null,
        entries: this.entries?.(i) ?? null,
        blocks,
      },
      pending,
    };
  }

  _publish() {
    clearTimeout(this._retry);
    const { snapshot, pending } = this.snapshot();
    const json = JSON.stringify(snapshot);
    if (json !== this._last) {
      this._last = json;
      this.link.publish(snapshot);
    }
    if (pending && this._tries++ < SETTLE_MAX_TRIES) {
      this._retry = setTimeout(() => this._publish(), SETTLE_RETRY_MS);
    } else if (!pending) {
      this._tries = 0;
    }
  }
}
