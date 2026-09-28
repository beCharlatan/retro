/* =========================================================
   ProjectorLink — the game window's side of the projector connection
   =========================================================
   Opens the projector window, keeps the latest picture, and sends it whenever the
   projector says it's missing it:

     const link = new ProjectorLink({ self: window, open: window.open.bind(window), url });
     link.open();             // from a click (popup blockers)
     link.publish(snapshot);  // any time; remembered even with no projector open

   The projector says `hello` (with the revision it holds) when it loads and again every
   few seconds, so the link heals by itself if EITHER window is reloaded or the popup is
   re-opened: a hello from a window we opened — or one whose opener is us, which covers a
   reload of this window — becomes the projector, and gets the latest snapshot if its
   revision differs. Messages from any other window are ignored.
========================================================= */
import { helloMessage, isProjectorMessage, snapshotMessage, WINDOW_NAME } from './protocol.js';

export class ProjectorLink {
  constructor({ self, open, url, popupFeatures = 'popup=yes,width=1280,height=720' }) {
    this.self = self;
    this._open = open;
    this.url = url;
    this.popupFeatures = popupFeatures;
    this.win = null;
    this.snapshot = { kind: 'idle' };
    // A per-page-load prefix, so a reloaded game window can't collide with a revision the
    // projector already holds from before the reload.
    // (crypto, not Math.random — the game's pairings draw from that one, and tests replace it.)
    this._session = crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
    this._n = 0;
    this._listeners = new Set();
    this._lastStatus = 'closed';
    self.addEventListener('message', (event) => this._onMessage(event));
  }

  get rev() {
    return `${this._session}:${this._n}`;
  }

  // 'open' | 'closed'
  get status() {
    return this.win && !this.win.closed ? 'open' : 'closed';
  }

  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  // Opens (or focuses) the projector window. Returns false if the browser blocked it.
  open() {
    const win = this._open(this.url, WINDOW_NAME, this.popupFeatures);
    if (!win) return false;
    this.win = win;
    win.focus?.();
    this._emit();
    return true;
  }

  publish(snapshot) {
    this.snapshot = snapshot;
    this._n++;
    this._send();
  }

  _send() {
    if (this.status !== 'open') return;
    try {
      this.win.postMessage(snapshotMessage(this.snapshot, this.rev), '*');
    } catch {
      // The window went away between the check and the send; the next hello or open() recovers.
    }
  }

  _onMessage(event) {
    if (!isProjectorMessage(event.data, 'hello')) return;
    const source = event.source;
    if (!source) return;
    const known = source === this.win;
    if (!known && source.opener !== this.self) return;
    const changed = this.win !== source;
    this.win = source;
    if (changed) this._emit();
    if (event.data.rev !== this.rev) this._send();
  }

  // The popup being closed raises no event we can hear — poll this now and then.
  check() {
    if (this.status !== this._lastStatus) this._emit();
  }

  _emit() {
    this._lastStatus = this.status;
    for (const fn of this._listeners) fn(this.status);
  }
}

export { helloMessage };
