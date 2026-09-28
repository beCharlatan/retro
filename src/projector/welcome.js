/* =========================================================
   <retro-projector-welcome> — the projector's welcome screen
   =========================================================
   What the room sees before a game starts: the same pastel world as the app's home map, alive —
   the game icons drift and turn, soft light orbs float behind them, the title (one solid colour) rises word by word,
   the people who are playing pop in one after another, and a line under them keeps changing to
   the next game on the programme. The whole thing is CSS animation (no physics loop), scaled with
   the window (vmin), and holds still for people who prefer reduced motion.
========================================================= */
import { css, html, LitElement, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { ICONS } from '../icon-assets.js';
import { avatarInitial, pickAvatarColor } from '../logic/format.js';
import { AVATAR_COLORS, GAMES } from '../state.js';
import { mapStyles } from '../styles/map-styles.js';

const TEASER_EVERY_MS = 4800;

// Where each game's icon floats: [left %, top %, size in vmin, depth 0 (near) | 1 (far)].
// Kept to the edges so the middle stays clear for the title.
const SPOTS = [
  [5, 9, 17, 0],
  [23, 4, 11, 1],
  [79, 6, 15, 0],
  [93, 26, 10, 1],
  [3, 44, 12, 1],
  [88, 52, 17, 0],
  [7, 76, 15, 0],
  [26, 91, 10, 1],
  [80, 90, 15, 0],
  [92, 82, 11, 1],
  [47, 2, 9, 1],
  [56, 93, 9, 1],
  [16, 58, 8, 1],
];

// a small deterministic spread, so each icon drifts differently but the same way every time
const spread = (i, salt) => (((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1) + 1) % 1;

export class RetroProjectorWelcome extends LitElement {
  static properties = {
    participants: { type: Array },
    people: { type: Array },
    hasOpener: { type: Boolean },
    _teaser: { state: true },
  };

  static styles = [
    mapStyles,
    css`
      :host {
        display: block;
        height: 100vh;
        min-height: 0;
        overflow: hidden;
        --unit: 1vmin;
      }

      /* ---- light orbs behind everything ---- */
      .orb {
        position: absolute;
        border-radius: 50%;
        filter: blur(6vmin);
        opacity: 0.55;
        pointer-events: none;
      }
      .orb.o1 {
        width: 60vmin;
        height: 60vmin;
        left: -12vmin;
        top: -14vmin;
        background: radial-gradient(circle, var(--map-cognitive), transparent 68%);
      }
      .orb.o2 {
        width: 56vmin;
        height: 56vmin;
        right: -10vmin;
        top: 18vmin;
        background: radial-gradient(circle, var(--map-social), transparent 68%);
      }
      .orb.o3 {
        width: 66vmin;
        height: 66vmin;
        left: 24vmin;
        bottom: -30vmin;
        background: radial-gradient(circle, var(--map-econ), transparent 68%);
      }

      /* ---- the drifting game icons ---- */
      .float {
        position: absolute;
        width: calc(var(--s) * 1vmin);
        height: calc(var(--s) * 1vmin);
        left: calc(var(--x) * 1%);
        top: calc(var(--y) * 1%);
        margin: calc(var(--s) * -0.5vmin) 0 0 calc(var(--s) * -0.5vmin);
        pointer-events: none;
      }
      .float img {
        width: 100%;
        height: 100%;
        object-fit: contain;
        filter: drop-shadow(0 1.4vmin 2vmin rgba(43, 37, 64, 0.22));
      }
      .float.far img {
        filter: blur(0.35vmin) drop-shadow(0 1vmin 1.6vmin rgba(43, 37, 64, 0.14));
        opacity: 0.8;
      }

      /* ---- the middle ---- */
      .stage {
        position: relative;
        z-index: 2;
        height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3.2vmin;
        padding: 4vmin 12vmin;
        box-sizing: border-box;
        text-align: center;
      }
      .kicker {
        display: inline-flex;
        align-items: center;
        gap: 1.2vmin;
        padding: 1.1vmin 2.6vmin;
        border-radius: 999px;
        background: var(--map-surface);
        box-shadow: var(--map-shadow-sm);
        font-size: 2.1vmin;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #5a3ad6;
      }
      .kicker i {
        width: 1.3vmin;
        height: 1.3vmin;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--map-social), var(--map-econ));
      }
      h1.title {
        margin: 0;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 0 2.2vmin;
        font-size: 11.5vmin;
        line-height: 1.02;
        font-weight: 800;
        letter-spacing: -0.03em;
        color: var(--map-ink);
        text-shadow: 0 0.6vmin 4vmin rgba(255, 255, 255, 0.9);
      }
      .word {
        display: inline-block;
      }
      .lede {
        margin: 0;
        max-width: 38em;
        font-size: 3.2vmin;
        line-height: 1.4;
        color: var(--map-ink-soft);
      }

      /* ---- who is playing ---- */
      .team {
        display: grid;
        gap: 1.6vmin;
        justify-items: center;
        max-width: 96vmin;
      }
      .team-label {
        font-size: 2vmin;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--map-ink-faint);
      }
      .team-label b {
        color: #5a3ad6;
      }
      .people {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 1.3vmin 1.3vmin;
      }
      .person {
        display: inline-flex;
        align-items: center;
        gap: 1vmin;
        padding: 0.7vmin 2vmin 0.7vmin 0.7vmin;
        border-radius: 999px;
        background: var(--map-surface);
        box-shadow: var(--map-shadow-sm);
        font-size: 2.7vmin;
        font-weight: 700;
        color: var(--map-ink);
      }
      .person .dot {
        width: 4vmin;
        height: 4vmin;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 2vmin;
        font-weight: 800;
        color: #fff;
      }
      .team-empty {
        padding: 1.8vmin 3.4vmin;
        border-radius: 999px;
        border: 0.3vmin dashed var(--map-line);
        background: var(--map-surface);
        font-size: 2.6vmin;
        color: var(--map-ink-soft);
      }

      /* ---- the programme line and the status pill ---- */
      .programme {
        min-height: 9vmin;
        display: grid;
        gap: 0.6vmin;
        justify-items: center;
      }
      .programme b {
        font-size: 3.1vmin;
        color: var(--map-ink);
      }
      .programme span {
        max-width: 46em;
        font-size: 2.5vmin;
        line-height: 1.35;
        color: var(--map-ink-soft);
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 1.6vmin;
        padding: 1.5vmin 3.2vmin;
        border-radius: 999px;
        background: var(--map-surface);
        box-shadow: var(--map-shadow);
        font-size: 2.6vmin;
        font-weight: 700;
        color: var(--map-ink);
      }
      .status .dots {
        display: inline-flex;
        gap: 0.8vmin;
      }
      .status .dots i {
        width: 1.4vmin;
        height: 1.4vmin;
        border-radius: 50%;
        background: var(--map-cognitive);
      }
      .hint {
        margin: 0;
        font-size: 2vmin;
        color: var(--map-ink-faint);
      }

      /* ================= motion (skipped for reduced motion) ================= */
      @media (prefers-reduced-motion: no-preference) {
        .orb.o1 {
          animation: orb-a 17s ease-in-out infinite alternate;
        }
        .orb.o2 {
          animation: orb-b 21s ease-in-out infinite alternate;
        }
        .orb.o3 {
          animation: orb-c 25s ease-in-out infinite alternate;
        }
        .float {
          animation: fade-in 1.2s ease-out both;
          animation-delay: calc(var(--i) * 0.11s);
        }
        .float img {
          animation: drift var(--dur) ease-in-out infinite;
          animation-delay: var(--delay);
        }
        .kicker {
          animation: rise 0.9s var(--map-ease) both 0.1s;
        }
        .word {
          animation: rise 0.95s var(--map-ease) both;
          animation-delay: calc(0.25s + var(--w) * 0.14s);
        }
        .lede {
          animation: rise 0.9s var(--map-ease) both 0.9s;
        }
        .team {
          animation: rise 0.9s var(--map-ease) both 1.15s;
        }
        .person {
          animation: pop 0.6s var(--map-ease) both;
          animation-delay: calc(1.35s + var(--p) * 0.09s);
        }
        .programme {
          animation: rise 0.9s var(--map-ease) both 1.5s;
        }
        .programme > * {
          animation: swap 0.7s var(--map-ease) both;
        }
        .status {
          animation: rise 0.9s var(--map-ease) both 1.8s;
        }
        .status .dots i {
          animation: beat 1.3s ease-in-out infinite;
        }
        .status .dots i:nth-child(2) {
          animation-delay: 0.18s;
        }
        .status .dots i:nth-child(3) {
          animation-delay: 0.36s;
        }
        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(4vmin) scale(0.96);
            filter: blur(1vmin);
          }
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            scale: 0.6;
          }
        }
        @keyframes pop {
          0% {
            opacity: 0;
            transform: scale(0.3) translateY(3vmin);
          }
          70% {
            transform: scale(1.08) translateY(0);
          }
          100% {
            opacity: 1;
            transform: none;
          }
        }
        @keyframes swap {
          from {
            opacity: 0;
            transform: translateY(1.6vmin);
          }
        }
        @keyframes drift {
          0%,
          100% {
            transform: translate3d(0, 0, 0) rotate(var(--r0));
          }
          50% {
            transform: translate3d(var(--dx), var(--dy), 0) rotate(var(--r1));
          }
        }
        @keyframes beat {
          0%,
          100% {
            opacity: 0.35;
            transform: translateY(0);
          }
          40% {
            opacity: 1;
            transform: translateY(-0.8vmin);
          }
        }
        @keyframes orb-a {
          to {
            transform: translate(16vmin, 12vmin) scale(1.15);
          }
        }
        @keyframes orb-b {
          to {
            transform: translate(-14vmin, 10vmin) scale(0.9);
          }
        }
        @keyframes orb-c {
          to {
            transform: translate(-18vmin, -12vmin) scale(1.12);
          }
        }
      }
    `,
  ];

  constructor() {
    super();
    this.participants = [];
    this.people = [];
    this.hasOpener = true;
    this._teaser = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    const ready = GAMES.filter((g) => g.ready);
    this._timer = setInterval(() => {
      this._teaser = (this._teaser + 1) % Math.max(1, ready.length);
    }, TEASER_EVERY_MS);
  }

  disconnectedCallback() {
    clearInterval(this._timer);
    super.disconnectedCallback();
  }

  _icon(game, i) {
    const [x, y, s, far] = SPOTS[i % SPOTS.length];
    const r = (k) => spread(i, k);
    const style = [
      `--x:${x}`,
      `--y:${y}`,
      `--s:${s}`,
      `--i:${i}`,
      `--dur:${(7 + r(1) * 6).toFixed(2)}s`,
      `--delay:${(-r(2) * 8).toFixed(2)}s`,
      `--dx:${((r(3) - 0.5) * 5).toFixed(2)}vmin`,
      `--dy:${((r(4) - 0.5) * 6).toFixed(2)}vmin`,
      `--r0:${((r(5) - 0.5) * 30).toFixed(1)}deg`,
      `--r1:${((r(6) - 0.5) * 30 + 12).toFixed(1)}deg`,
    ].join(';');
    return html`<div class="float ${far ? 'far' : ''}" style=${style} aria-hidden="true">
      <img src=${ICONS[game.icon]} alt="" />
    </div>`;
  }

  render() {
    const games = GAMES.filter((g) => g.ready);
    const order = this.people?.length ? this.people : this.participants;
    const words = '5 минут общего развития'.split(' ');
    const next = games[this._teaser % Math.max(1, games.length)];
    return html`
      <div class="orb o1"></div>
      <div class="orb o2"></div>
      <div class="orb o3"></div>
      ${GAMES.map((g, i) => this._icon(g, i))}

      <div class="stage" data-testid="projector-waiting">
        <span class="kicker"><i></i>Командные мини-эксперименты</span>
        <h1 class="title" aria-label="5 минут общего развития">
          ${words.map((w, i) => html`<span class="word" style="--w:${i}" aria-hidden="true">${w}</span>`)}
        </h1>
        <p class="lede">
          ${games.length} коротких игр о том, как мы принимаем решения, ошибаемся и договариваемся
        </p>

        <div class="team" data-testid="welcome-team">
          ${
            this.participants?.length
              ? html`<span class="team-label">Сегодня играют · <b>${this.participants.length}</b></span>
                  <div class="people">
                    ${this.participants.map(
                      (
                        name,
                        i,
                      ) => html`<span class="person" style="--p:${i}" data-testid="welcome-person">
                        <span class="dot" style="background:${pickAvatarColor(name, order, AVATAR_COLORS)}">${avatarInitial(name)}</span>${name}
                      </span>`,
                    )}
                  </div>`
              : html`<span class="team-empty" data-testid="welcome-empty">Команда соберётся здесь — игроков добавляет ведущий</span>`
          }
        </div>

        <div class="programme" data-testid="welcome-programme" aria-live="off">
          ${next ? keyed(next.id, html`<b>${next.name}</b><span>${next.teaser}</span>`) : nothing}
        </div>

        <div class="status">
          <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>
          ${
            this.hasOpener
              ? 'Скоро начнём — ведущий выбирает игру'
              : 'Ждём подключения основного окна'
          }
        </div>
        ${
          this.hasOpener
            ? nothing
            : html`<p class="hint">Это окно нужно открывать кнопкой «экран для показа» в приложении.</p>`
        }
      </div>
    `;
  }
}

customElements.define('retro-projector-welcome', RetroProjectorWelcome);
