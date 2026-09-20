/* =========================================================
   RoundFlowController — Lit ReactiveController for the
   one-continuous-scroll деталка layout (all 13 games)
   =========================================================
   Replaces what every game used to declare by hand: three reactive
   properties (screenIdx / activeRound / justCompletedIdx), a
   firstUpdated() that attached scroll tracking, a disconnectedCallback()
   that removed it and cleared the flash timer, and four one-line
   wrapper methods. The rules for moving the numbers are pure
   (logic/round-flow.js); this class adds the browser half — scroll
   tracking, smooth scrolling, the completion pause — and cleans all of
   it up when the host disconnects.

     constructor() { this.flow = new RoundFlowController(this, { titles: ROUND_TITLES }); }
     <section class="${this.flow.roundClass(2)}" id="round-2"> … ${this.flow.lock(2)}
     this.flow.advance(3, () => this._showResults());
     this.flow.scrollTo(1);
     this.flow.reset();

   `titles` is an array, or a function returning one (calibration's
   titles depend on its current questions). `sleep`, `scroll`,
   `setTimeout` and `clearTimeout` are injectable so the async
   sequencing is unit-testable without a DOM or real waiting.
========================================================= */
import { html } from 'lit';
import {
  activeIndexFromTops,
  advanceFlow,
  clearFlash,
  initialFlow,
  isRoundLocked,
  READING_LINE_FRAC,
  roundClassName,
  setActiveRound,
} from '../logic/round-flow.js';

export const ROUND_COMPLETE_FLASH_MS = 900;
// Beat the flash gets to register on the JUST-COMPLETED round before
// the page starts scrolling it away — without it the scroll starts the
// same instant the flash does, and by the time the eye catches it the
// finished round has scrolled off, leaving a sliver of flashed border
// that reads as "the next round flashed".
export const ROUND_COMPLETE_PAUSE_MS = 320;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Round 0 is a special case: scrollIntoView({block:'start'}) would put
// ITS top at the viewport top, which is --round-0-offset px short of the
// real page top (.wrap-wide's own top padding sits above it), so going
// back to round 0 would settle a few dozen px into the page.
function defaultScroll(host, idx) {
  const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
  if (idx === 0) {
    window.scrollTo({ top: 0, behavior });
    return;
  }
  host.renderRoot?.getElementById(`round-${idx}`)?.scrollIntoView({ behavior, block: 'start' });
}

export class RoundFlowController {
  constructor(
    host,
    {
      titles = [],
      sleep = defaultSleep,
      scroll = defaultScroll,
      setTimeout: setTimer = (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: clearTimer = (id) => globalThis.clearTimeout(id),
    } = {},
  ) {
    this.host = host;
    this._setTimer = setTimer;
    this._clearTimer = clearTimer;
    this.state = initialFlow();
    this._titles = titles;
    this._sleep = sleep;
    this._scroll = scroll;
    this._stopNav = null;
    this._flashTimer = null;
    host.addController(this);
  }

  get screenIdx() {
    return this.state.screenIdx;
  }
  get activeRound() {
    return this.state.activeRound;
  }
  get justCompletedIdx() {
    return this.state.justCompletedIdx;
  }

  // ---- lifecycle ----

  // First render is done: the rounds exist, so scroll tracking can attach.
  hostUpdated() {
    if (!this._stopNav) this._stopNav = this._attachNav();
  }

  hostDisconnected() {
    this._stopNav?.();
    this._stopNav = null;
    this._clearTimer(this._flashTimer);
    this._flashTimer = null;
  }

  // ---- state changes ----

  // Runs `action` (if given), unlocks up to `toIdx` and flashes the round
  // just finished, waits for Lit to re-render (so the target round is no
  // longer .round-pending when it scrolls in), holds for the flash to
  // register, then scrolls to `toIdx`.
  async advance(toIdx, action) {
    action?.();
    this._set(advanceFlow(this.state, toIdx));
    await this.host.updateComplete;
    if (!prefersReducedMotion()) await this._sleep(ROUND_COMPLETE_PAUSE_MS);
    this.scrollTo(toIdx);
    this._clearTimer(this._flashTimer);
    this._flashTimer = this._setTimer(
      () => this._set(clearFlash(this.state)),
      ROUND_COMPLETE_FLASH_MS,
    );
  }

  scrollTo(idx) {
    this._scroll(this.host, idx);
  }

  // Back to the very start ("Начать заново").
  reset() {
    this._clearTimer(this._flashTimer);
    this._set(initialFlow());
  }

  // ---- template helpers ----

  roundClass(i) {
    return roundClassName(this.state, i);
  }

  // The blurred-content overlay for a round not reached yet — only a
  // round's own primary button (advance) lifts it; scrolling past it on
  // the way back to an earlier round does not, on purpose.
  lock(i) {
    if (!isRoundLocked(this.state, i)) return '';
    const titles = typeof this._titles === 'function' ? this._titles() : this._titles;
    return html`
      <div class="round-lock">
        <span class="round-lock-title">${titles[i]}</span>
      </div>
    `;
  }

  // ---- internals ----

  _set(next) {
    if (next === this.state) return;
    this.state = next;
    this.host.requestUpdate();
  }

  // Measures --round-0-offset (round 0 sits below .wrap-wide's top
  // padding, so a plain 100vh on it would run past the first screen)
  // and tracks which round is at the reading line. Plain scroll+rAF
  // position check, not an IntersectionObserver ratio race — see
  // activeIndexFromTops().
  _attachNav() {
    const root = this.host.renderRoot;
    const round0 = root?.getElementById('round-0');
    if (round0) {
      this.host.style.setProperty('--round-0-offset', `${round0.getBoundingClientRect().top}px`);
    }
    const rounds = Array.from(root?.querySelectorAll('.round') ?? []);
    let raf = null;
    const compute = () => {
      raf = null;
      const tops = rounds.map((el) => el.getBoundingClientRect().top);
      const idx = activeIndexFromTops(tops, window.innerHeight * READING_LINE_FRAC);
      this._set(setActiveRound(this.state, idx));
    };
    const onScroll = () => {
      if (raf == null) raf = requestAnimationFrame(compute);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    compute();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }
}
