/* =========================================================
   SpoilerController — which spoiler cards are hidden (a plain helper, not a lifecycle controller)
   =========================================================
   Framing (a card per group and scenario) and Barnum (the questions, the
   portrait) hide the wording a facilitator sends out privately, so it isn't read
   off a shared screen. Every card starts hidden.

     constructor() { this.spoilers = new SpoilerController(this, ['questions', 'profile']); }
     render()      { return renderSpoilerCard(this.spoilers, { key: 'profile', … }); }
     _reset()      { this.spoilers.hideAll(); }

   The map is replaced, never mutated, and the host is asked to redraw.
========================================================= */
export class SpoilerController {
  constructor(host, keys) {
    this.host = host;
    this.keys = keys;
    this.hidden = this._all(true);
  }

  isHidden(key) {
    return this.hidden[key] !== false;
  }

  toggle(key) {
    this.hidden = { ...this.hidden, [key]: !this.isHidden(key) };
    this.host.requestUpdate();
  }

  hideAll() {
    this.hidden = this._all(true);
    this.host.requestUpdate();
  }

  _all(value) {
    return Object.fromEntries(this.keys.map((k) => [k, value]));
  }
}
