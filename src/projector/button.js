/* =========================================================
   <retro-projector-button> — opens the projector window
   =========================================================
   A round button next to the × of a game (or in a corner of the map). One click opens
   the projector — a second window meant to be shared in a video call — and clicking
   again brings it to the front. A small dot says the window is open.
   The popup has to come from a click, otherwise browsers block it.
========================================================= */
import { css, html, LitElement } from 'lit';
import { showToast } from '../toast.js';
import { projector } from './index.js';

const ICON = html`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M10.5 7.8v4.4l3.6-2.2z" fill="currentColor" stroke="none"/></svg>`;

export class RetroProjectorButton extends LitElement {
  static properties = { status: { state: true } };

  static styles = css`
    :host {
      position: fixed;
      top: 20px;
      right: 68px;
      z-index: 20;
    }
    /* on the map: beside "Случайная игра" (bottom right), not over the filters */
    :host(.home-projector) {
      top: auto;
      bottom: 22px;
      right: 196px;
    }
    button {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 50%;
      background: var(--white, #fff);
      color: var(--ink-faint, #6b6b6b);
      box-shadow: 0 2px 10px -2px rgba(43, 37, 64, 0.18);
      cursor: pointer;
      transition: color 0.15s, background 0.15s;
    }
    button:hover {
      color: var(--ink, #333);
      background: var(--surface, #f2f2f2);
    }
    button:focus-visible {
      outline: 3px solid var(--game-accent-deep, #2750ae);
      outline-offset: 2px;
    }
    .dot {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #1a9a52;
      border: 2px solid var(--white, #fff);
    }
    @media (prefers-reduced-motion: reduce) {
      button {
        transition: none;
      }
    }
  `;

  constructor() {
    super();
    this.status = projector.status;
  }

  connectedCallback() {
    super.connectedCallback();
    this.status = projector.status;
    this._off = projector.onChange((s) => {
      this.status = s;
    });
  }

  disconnectedCallback() {
    this._off?.();
    super.disconnectedCallback();
  }

  _open() {
    if (!projector.open()) {
      showToast('Браузер заблокировал окно — разрешите всплывающие окна для этой страницы');
    }
  }

  render() {
    const open = this.status === 'open';
    const label = open
      ? 'Экран для показа открыт — нажмите, чтобы показать окно'
      : 'Открыть экран для показа (окно, которое можно расшарить в Zoom)';
    return html`
      <button type="button" data-testid="projector-open" aria-label=${label} title=${label} @click=${this._open}>
        ${ICON}${open ? html`<span class="dot" aria-hidden="true"></span>` : ''}
      </button>
    `;
  }
}

customElements.define('retro-projector-button', RetroProjectorButton);
