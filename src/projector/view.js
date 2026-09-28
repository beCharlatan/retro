/* =========================================================
   <retro-projector> — the "show only" window
   =========================================================
   Opened from the game window (projector/button.js) and shared in a video call. It looks
   like the app's own game screen — the content on the left, the game's trail with its 3D
   icon on the right — because the room is looking at it, not the facilitator: the task or
   question, a large timer, who is in which group or pair, and the results with their chart.
   No entry forms, no controls, nothing that was not marked public in the game (see
   projector/collect.js).

   It only draws the latest snapshot it was sent; every few seconds it says hello to the
   game window so the picture arrives again after either window is reloaded. The whole
   screen is laid out on a fixed-width canvas and scaled to the window (projector/fit.js).
========================================================= */
import { css, html, LitElement, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { repeat } from 'lit/directives/repeat.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { renderTrail } from '../game-trail.js';
import { avatarInitial } from '../logic/format.js';
import { formatTimer } from '../logic/timer.js';
import { avatarColor, CATEGORY, GAMES, STRUCTURE } from '../state.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { CANVAS_WIDTH, chartAspect, fitScale, SHORT_CHART, WIDE_CANVAS_WIDTH } from './fit.js';
import { helloMessage, isProjectorMessage, normalizeSnapshot } from './protocol.js';
import { sanitizeHtml } from './sanitize.js';
import './welcome.js';

const HELLO_EVERY_MS = 2500;
const HEAD_ROLES = ['eyebrow', 'title', 'lede'];
const RING_R = 76;
const RING_LENGTH = 2 * Math.PI * RING_R;

// A name with its avatar, built with lit templates so whatever was typed as a name is escaped.
const person = (name) => html`<span class="name-with-avatar"
  ><span class="avatar avatar-sm" style="background:${avatarColor(name)}">${avatarInitial(name)}</span
  >${name}</span
>`;

export class RetroProjector extends LitElement {
  static properties = {
    snapshot: { state: true },
    hasOpener: { state: true },
    scale: { state: true },
  };

  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        height: 100vh;
        overflow: hidden;
        background: var(--panel);
      }
      .stage {
        position: relative;
        height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background:
          radial-gradient(
            ellipse 60% 70% at 88% 12%,
            color-mix(in srgb, var(--game-accent, var(--blue)) 16%, transparent),
            transparent 70%
          ),
          radial-gradient(
            ellipse 50% 60% at 6% 96%,
            color-mix(in srgb, var(--game-accent, var(--blue)) 9%, transparent),
            transparent 70%
          ),
          var(--panel);
      }
      .canvas {
        flex: none;
        visibility: hidden; /* until it has been scaled to the window, so it never flashes at full size */
        box-sizing: border-box;
        padding: 46px 60px 52px;
        transform-origin: center center;
      }
      .canvas.fitted {
        visibility: visible;
      }
      .canvas .round-body {
        display: block;
      }
      .canvas .game-shell {
        margin-top: 0;
        gap: 64px;
        grid-template-columns: minmax(0, 1fr) 300px;
      }
      .canvas .game-rail {
        position: static;
      }
      .canvas .game-rail-title {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 18px;
      }
      .canvas .game-trail.vertical .trail-step-label {
        font-size: 15px;
      }

      /* each step's content arrives with a soft rise, so a step change reads as a change */
      @media (prefers-reduced-motion: no-preference) {
        .content-enter {
          animation: step-in 0.6s var(--ease) both;
        }
        .stage {
          animation: stage-in 0.5s var(--ease) both;
        }
        @keyframes step-in {
          from {
            opacity: 0;
            transform: translateY(2.2vmin);
          }
        }
        @keyframes stage-in {
          from {
            opacity: 0;
          }
        }
      }

      /* ---- the room-facing type: bigger than the app's, the same voice ---- */
      .pb-eyebrow .eyebrow {
        font-size: 15px;
        padding: 7px 16px;
        margin-bottom: 18px;
      }
      .pb-title h1 {
        font-size: 50px;
        line-height: 1.12;
        margin-bottom: 20px;
      }
      .pb-title h2 {
        font-size: 38px;
        line-height: 1.2;
        font-weight: 600;
        margin-bottom: 20px;
      }
      .pb-lede .lede {
        font-size: 24px;
        line-height: 1.5;
        color: var(--ink-soft);
        max-width: none;
        margin: 0 0 26px;
      }
      /* end-of-game standings */
      .pb-body .leaderboard-title {
        font-size: 14px;
      }
      .pb-body .leaderboard ol {
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      }
      .pb-body .leaderboard li {
        font-size: 19px;
        padding: 8px 12px;
      }
      .pb-body .leaderboard-place {
        width: 30px;
        height: 30px;
        font-size: 14px;
      }
      /* a game's scoreboard (Долларовый аукцион, Пивная игра) */
      .pb-body .board-cell .n {
        font-size: 52px;
      }
      .pb-body .board-cell .lab {
        font-size: 18px;
      }
      /* Долларовый аукцион: the last bids, readable from the back row */
      .pb-body .bid-history-title {
        font-size: 14px;
      }
      .pb-body .bid-history li {
        font-size: 18px;
        padding: 7px 16px;
      }
      .pb-body .bid-history li b {
        font-size: 24px;
      }
      .pb-body .bid-history li i {
        font-size: 14px;
      }
      /* the rules card, read from across the room */
      .pb-body .rules-card {
        gap: 22px;
        padding: 26px 28px;
      }
      .pb-body .rules-items {
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 16px;
      }
      .pb-body .rules-item {
        padding: 16px 18px;
      }
      .pb-body .rules-item b {
        font-size: 22px;
      }
      .pb-body .rules-item span {
        font-size: 18px;
      }
      .pb-body .rules-flow-title {
        font-size: 14px;
      }
      .pb-body .rules-flow li {
        font-size: 17px;
        padding: 6px 14px 6px 7px;
      }
      .pb-body .rules-flow li::before {
        width: 26px;
        height: 26px;
        font-size: 13px;
      }
      .pb-body .stat-row {
        margin-top: 8px;
      }
      .pb-body .stat {
        padding: 24px 26px;
      }
      .pb-body .stat .n {
        font-size: 46px;
        margin-bottom: 12px;
      }
      .pb-body .stat .lab {
        font-size: 19px;
      }
      .pb-reveal .reveal .n {
        font-size: 112px;
        margin-bottom: 18px;
      }
      .pb-reveal .reveal-verdict dd {
        font-size: 23px;
        line-height: 1.45;
      }
      .pb-reveal .reveal-verdict dt {
        font-size: 13px;
      }
      .pb-chart .d3-chart-card,
      .pb-chart .chart-wrap {
        margin-bottom: 20px;
      }

      /* ---- results ----
         a wide, short chart goes under the numbers at full width; a tall one sits beside them */
      .results-stack .pb-reveal .reveal {
        display: flex;
        align-items: center;
        gap: 44px;
        margin: 0 0 22px;
        padding: 24px 32px;
      }
      .results-stack .pb-reveal .reveal .n {
        flex: none;
        margin: 0;
      }
      .results-stack .pb-reveal .reveal-lines {
        margin: 0;
        flex: 1;
      }
      .results-stack .d3-chart-card,
      .results-stack .chart-wrap {
        margin: 0 0 12px;
      }
      .wide-grid {
        display: grid;
        grid-template-columns: 4.6fr 7.4fr;
        column-gap: 36px;
        align-items: start;
      }
      .wide-grid .reveal {
        margin-top: 0;
      }
      .wide-grid .reveal-line {
        grid-template-columns: 1fr;
        gap: 8px;
      }
      .wide-grid .d3-chart-card,
      .wide-grid .chart-wrap {
        margin: 0 0 20px;
      }

      /* ---- the first screen: what kind of exercise this is ---- */
      .meta-row {
        display: flex;
        gap: 16px;
        margin: 8px 0 28px;
      }
      .meta-card {
        flex: 1;
        min-width: 0;
        padding: 18px 22px;
        background: var(--white);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow:
          0 3px 14px -6px rgba(43, 37, 64, 0.18),
          0 1px 2px rgba(43, 37, 64, 0.05);
      }
      .meta-card dt {
        margin: 0 0 6px;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
        color: var(--ink-faint);
      }
      .meta-card dd {
        margin: 0;
        font-size: 26px;
        font-weight: 700;
        line-height: 1.2;
        color: var(--game-accent-deep, var(--ink));
      }

      /* ---- the timer lives on the round map: a ring around the traveler, the seconds under it ----
         (positioned over the traveler by _placeTimer; the screen itself pulses in the last seconds) */
      .canvas .game-rail {
        position: relative;
      }
      .trail-timer {
        position: absolute;
        left: 0;
        top: 0;
        width: 168px;
        height: 168px;
        margin: -84px 0 0 -84px;
        pointer-events: none;
        z-index: 3;
        visibility: hidden;
      }
      .trail-timer.placed {
        visibility: visible;
      }
      .trail-timer.animated {
        transition:
          left 0.5s var(--ease),
          top 0.5s var(--ease);
      }
      .timer-ring {
        position: absolute;
        inset: 0;
      }
      .timer-ring svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
        overflow: visible;
      }
      .timer-ring .track {
        fill: none;
        stroke: color-mix(in srgb, var(--game-accent, var(--blue)) 18%, white);
        stroke-width: 9;
      }
      .timer-ring .bar {
        fill: none;
        stroke: var(--game-accent, var(--blue));
        stroke-width: 9;
        stroke-linecap: round;
        transition:
          stroke-dashoffset 1s linear,
          stroke 0.4s;
        filter: drop-shadow(0 0 6px color-mix(in srgb, var(--game-accent, var(--blue)) 60%, transparent));
      }
      .trail-timer.idle .bar {
        stroke: color-mix(in srgb, var(--game-accent, var(--blue)) 45%, white);
        filter: none;
      }
      .trail-timer.urgent .bar {
        stroke: var(--red);
        filter: drop-shadow(0 0 8px color-mix(in srgb, var(--red) 70%, transparent));
      }
      .timer-badge {
        position: absolute;
        left: 50%;
        top: 100%;
        transform: translateX(-50%);
        margin-top: 6px;
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 150px;
        max-width: 250px;
        padding: 6px 18px 8px;
        text-align: center;
        background: var(--white);
        border: 1px solid var(--line);
        border-radius: 18px;
        box-shadow:
          0 10px 26px -12px rgba(43, 37, 64, 0.35),
          0 1px 2px rgba(43, 37, 64, 0.08);
      }
      .timer-badge .timer-time {
        font-size: 46px;
        font-weight: 800;
        line-height: 1.05;
        letter-spacing: -0.02em;
        font-variant-numeric: tabular-nums;
        color: var(--game-accent-deep, var(--ink));
      }
      .timer-badge .timer-label {
        font-size: 16px;
        font-weight: 600;
        line-height: 1.2;
        color: var(--ink-soft);
      }
      .trail-timer.idle .timer-time {
        color: var(--ink-faint);
      }
      .trail-timer.urgent .timer-time {
        color: var(--red-deep, #b3123f);
      }
      /* time is up: no ring, just a small red tag under the traveler */
      .trail-timer.done .timer-badge {
        top: 50%;
        margin-top: 60px;
        flex-direction: row;
        align-items: baseline;
        gap: 8px;
        min-width: 0;
        white-space: nowrap;
        padding: 6px 16px;
        border-radius: 999px;
        background: var(--red-soft);
        border-color: color-mix(in srgb, var(--red) 40%, white);
      }
      .trail-timer.done .timer-time {
        font-size: 20px;
        color: var(--red-deep, #b3123f);
      }
      .trail-timer.done .timer-label {
        font-size: 18px;
        font-weight: 700;
        color: var(--red-deep, #b3123f);
      }
      .ripple {
        position: absolute;
        inset: 8px;
        border-radius: 50%;
        border: 4px solid var(--red);
        opacity: 0;
      }

      /* the whole screen beats once a second for the last three seconds, and flashes when time is up */
      .pulse {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 5;
      }
      @media (prefers-reduced-motion: no-preference) {
        .pulse.beat {
          animation: pulse-beat 1s ease-out both;
        }
        .pulse.final {
          animation: pulse-final 1.5s ease-out both;
        }
        .trail-timer.beating .timer-time {
          animation: tick-beat 1s ease-out both;
        }
        .trail-timer.beating .timer-ring {
          animation: ring-beat 1s ease-out both;
        }
        .trail-timer.beating .ripple {
          animation: ripple 1s ease-out both;
        }
        .trail-timer.beating .ripple.r2 {
          animation-delay: 0.18s;
        }
        .trail-timer.done .timer-badge {
          animation: tag-in 0.5s var(--ease) both;
        }
        @keyframes pulse-beat {
          0% {
            box-shadow: inset 0 0 0 0 rgba(239, 48, 97, 0);
          }
          14% {
            box-shadow: inset 0 0 170px 46px rgba(239, 48, 97, 0.5);
          }
          100% {
            box-shadow: inset 0 0 80px 8px rgba(239, 48, 97, 0);
          }
        }
        @keyframes pulse-final {
          0% {
            background: rgba(239, 48, 97, 0.32);
            box-shadow: inset 0 0 240px 90px rgba(239, 48, 97, 0.65);
          }
          100% {
            background: rgba(239, 48, 97, 0);
            box-shadow: inset 0 0 90px 0 rgba(239, 48, 97, 0);
          }
        }
        @keyframes tick-beat {
          0% {
            transform: scale(1.32);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes ring-beat {
          0% {
            transform: scale(1.09);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes ripple {
          0% {
            transform: scale(1);
            opacity: 0.75;
          }
          100% {
            transform: scale(2.7);
            opacity: 0;
          }
        }
        @keyframes tag-in {
          0% {
            transform: translateX(-50%) scale(1.5);
            opacity: 0;
          }
          100% {
            transform: translateX(-50%) scale(1);
            opacity: 1;
          }
        }
      }
      /* without motion: a steady red frame instead of the beat */
      @media (prefers-reduced-motion: reduce) {
        .pulse.beat {
          box-shadow: inset 0 0 0 10px rgba(239, 48, 97, 0.55);
        }
      }

      /* ---- who is in which group / pair ---- */
      .roster {
        margin: 6px 0 30px;
      }
      .roster-title {
        margin: 0 0 14px;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--ink-faint);
      }
      .roster .role-groups {
        gap: 20px;
        flex-wrap: nowrap;
      }
      .roster .role-group-col {
        min-width: 0;
        padding: 22px 24px;
      }
      .roster .role-group-title {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 14px;
      }
      .roster .role-group-title {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .roster .role-group-chips .name-with-avatar .avatar {
        display: inline-flex;
        margin-right: 7px;
        vertical-align: middle;
      }
      .roster .role-group-count {
        margin: -10px 0 14px;
        font-size: 18px;
        font-weight: 500;
        color: var(--ink-faint);
      }
      /* three and more groups (a game's pairs, a supply chain's four links): a wrapping
         grid instead of one squeezed row, so no title breaks and no name spills out */
      .roster .role-groups.many {
        display: grid;
        grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
        gap: 14px;
      }
      .roster .role-groups.many .role-group-col {
        padding: 16px 16px;
      }
      .roster .role-groups.many .role-group-title {
        font-size: 20px;
      }
      .roster .role-groups.many .role-group-count {
        font-size: 15px;
      }
      .roster .role-groups.many .role-group-chips .role-chip {
        font-size: 16px;
        padding: 6px 12px 6px 7px;
      }
      .roster .role-groups.many .role-group-chips .avatar-sm {
        width: 24px;
        height: 24px;
        font-size: 11px;
      }
      .roster .role-group-chips .role-chip {
        max-width: 100%;
        min-width: 0;
      }
      /* a block, not the usual inline-flex, so a name too long for its card can end in "…" */
      .roster .role-group-chips .name-with-avatar {
        display: block;
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }
      .roster .role-group-chips .role-chip {
        font-size: 20px;
        padding: 9px 16px 9px 10px;
        cursor: default;
      }
      .roster .role-group-chips .avatar-sm {
        width: 28px;
        height: 28px;
        font-size: 13px;
      }
      .roster .role-pairs {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px 20px;
      }
      .wide-grid .roster .role-pairs {
        grid-template-columns: 1fr;
      }
      .roster .role-pair-card {
        padding: 20px 20px;
        min-width: 0;
        box-shadow:
          0 3px 14px -6px rgba(43, 37, 64, 0.18),
          0 1px 2px rgba(43, 37, 64, 0.05);
      }
      .roster .role-pair-name {
        font-size: 21px;
        cursor: default;
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        display: block;
      }
      .roster .role-pair-side {
        min-width: 0;
      }
      .roster .role-pair-label {
        font-size: 12px;
        margin-top: 6px;
        letter-spacing: 0.04em;
      }
      .roster .role-pair-vs {
        font-size: 22px;
      }
      .roster .avatar-sm {
        width: 26px;
        height: 26px;
        font-size: 12px;
      }
      .roster .role-pair-trio-badge {
        font-size: 12px;
        top: -11px;
      }

      /* the same roster, squeezed, when the entries are shown under it */
      .roster.compact {
        margin-bottom: 18px;
      }
      .roster.compact .roster-title {
        margin-bottom: 8px;
        font-size: 12px;
      }
      .roster.compact .role-group-col {
        padding: 10px 14px;
      }
      .roster.compact .role-group-title {
        font-size: 17px;
        margin-bottom: 8px;
      }
      .roster.compact .role-group-count {
        margin: -6px 0 8px;
        font-size: 14px;
      }

      .roster.compact .role-group-chips .role-chip {
        font-size: 14px;
        padding: 4px 10px 4px 5px;
      }
      .roster.compact .role-group-chips .avatar-sm {
        width: 20px;
        height: 20px;
        font-size: 10px;
      }
      .roster.compact .role-pairs {
        grid-template-columns: repeat(3, 1fr);
        gap: 8px 10px;
      }
      .roster.compact .role-pair-card {
        padding: 8px 10px;
      }
      .roster.compact .role-pair-name {
        font-size: 14px;
      }
      .roster.compact .role-pair-label {
        display: none;
      }
      .roster.compact .role-pair-vs {
        width: 16px;
        font-size: 14px;
      }
      .roster.compact .avatar-sm {
        width: 20px;
        height: 20px;
        font-size: 10px;
      }

      /* ---- what has been entered so far ---- */
      .entries {
        margin: 4px 0 26px;
      }
      .entries-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 10px;
      }
      .entries-head .roster-title {
        margin: 0;
      }
      .entries-count {
        font-size: 20px;
        color: var(--ink-soft);
      }
      .entries-count b {
        font-size: 30px;
        color: var(--game-accent-deep, var(--ink));
      }
      .entries-track {
        height: 10px;
        margin-bottom: 18px;
        background: var(--line);
        border-radius: 99px;
        overflow: hidden;
      }
      .entries-track > div {
        height: 100%;
        background: var(--game-accent-fill, var(--game-accent, var(--blue)));
        border-radius: 99px;
        transition: width 0.4s var(--ease);
      }
      .entries-empty {
        margin: 6px 0 0;
        padding: 22px 26px;
        border: 1px dashed var(--line);
        border-radius: var(--radius);
        font-size: 22px;
        color: var(--ink-faint);
      }
      .entry-cards {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px 16px;
      }
      .entry-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-width: 0;
        padding: 12px 18px;
        background: var(--white);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow:
          0 3px 14px -6px rgba(43, 37, 64, 0.18),
          0 1px 2px rgba(43, 37, 64, 0.05);
      }
      .entry-who {
        min-width: 0;
        font-size: 21px;
        font-weight: 600;
      }
      .entry-who .pair-sep {
        color: var(--gold);
        margin: 0 6px;
      }
      .entry-who .pair {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .entry-tag {
        margin-top: 3px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--ink-faint);
      }
      .entry-cells {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 6px 14px;
        text-align: right;
      }
      .ec-cell {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        line-height: 1.15;
      }
      .ec-cell small {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--ink-faint);
      }
      .ec-cell b {
        font-size: 24px;
        color: var(--game-accent-deep, var(--ink));
        white-space: nowrap;
      }
      .anon-tiles {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
      }
      .anon-tile {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 12px 16px;
        background: var(--white);
        border: 1px solid var(--line);
        border-radius: var(--radius);
        box-shadow:
          0 3px 14px -6px rgba(43, 37, 64, 0.18),
          0 1px 2px rgba(43, 37, 64, 0.05);
      }
      .anon-tile small {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--ink-faint);
      }
      .anon-tile b {
        font-size: 28px;
        color: var(--game-accent-deep, var(--ink));
        white-space: nowrap;
      }
      @media (prefers-reduced-motion: no-preference) {
        .entry-card,
        .anon-tile {
          animation: entry-in 0.55s var(--ease) both;
        }
        @keyframes entry-in {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.96);
          }
        }
      }

      /* ---- a step with nothing public to show yet ---- */
      .hold {
        display: flex;
        align-items: center;
        gap: 22px;
        margin: 26px 0 0;
        padding: 30px 36px;
        background: var(--white);
        border: 1px dashed color-mix(in srgb, var(--game-accent, var(--blue)) 45%, var(--line));
        border-radius: 22px;
        font-size: 30px;
        line-height: 1.35;
        color: var(--ink-soft);
      }
      .hold .dots {
        display: inline-flex;
        gap: 8px;
        flex: none;
      }
      .hold .dots i {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--game-accent, var(--blue));
        opacity: 0.4;
      }
      @media (prefers-reduced-motion: no-preference) {
        .hold .dots i {
          animation: hold-dot 1.4s ease-in-out infinite;
        }
        .hold .dots i:nth-child(2) {
          animation-delay: 0.2s;
        }
        .hold .dots i:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes hold-dot {
          40% {
            opacity: 1;
            transform: translateY(-6px);
          }
        }
      }

      /* ---- waiting for a game ---- */
      .waiting {
        background:
          radial-gradient(ellipse 60% 70% at 88% 12%, color-mix(in srgb, var(--blue) 14%, transparent), transparent 70%),
          radial-gradient(ellipse 50% 60% at 6% 96%, color-mix(in srgb, var(--blue) 8%, transparent), transparent 70%),
          var(--panel);
        height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 2.2vmin;
        padding: 6vmin;
        box-sizing: border-box;
      }
      .waiting .badge-icon {
        width: 16vmin;
        height: 16vmin;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 32%;
        background: var(--white);
        color: var(--game-accent-deep, var(--blue-deep));
        box-shadow:
          0 14px 40px -14px rgba(43, 37, 64, 0.35),
          0 1px 2px rgba(43, 37, 64, 0.08);
      }
      .waiting .badge-icon svg {
        width: 55%;
        height: 55%;
      }
      .waiting h1 {
        font-size: clamp(34px, 7.4vmin, 92px);
        margin: 0;
        color: var(--ink);
      }
      .waiting p {
        font-size: clamp(16px, 3vmin, 34px);
        margin: 0;
        max-width: 26em;
        color: var(--ink-soft);
      }
      .waiting .hint {
        font-size: clamp(14px, 2.2vmin, 24px);
        color: var(--ink-faint);
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
      }
      @media (prefers-reduced-motion: reduce) {
        .timer-ring .bar,
        .trail-timer.animated {
          transition: none;
        }
      }
    `,
  ];

  constructor() {
    super();
    this.snapshot = { kind: 'idle' };
    this.hasOpener = !!window.opener;
    this.scale = 1;
    this._rev = null;
  }

  connectedCallback() {
    super.connectedCallback();
    document.title = 'Экран для показа';
    this._onMessage = (event) => {
      if (!window.opener || event.source !== window.opener) return;
      if (!isProjectorMessage(event.data, 'snapshot')) return;
      this._rev = event.data.rev;
      this.snapshot = normalizeSnapshot(event.data.snapshot) ?? { kind: 'idle' };
    };
    this._onResize = () => this._fit();
    window.addEventListener('message', this._onMessage);
    window.addEventListener('resize', this._onResize);
    this._hello();
    this._helloTimer = setInterval(() => this._hello(), HELLO_EVERY_MS);
  }

  disconnectedCallback() {
    window.removeEventListener('message', this._onMessage);
    window.removeEventListener('resize', this._onResize);
    clearInterval(this._helloTimer);
    this._resizeObserver?.disconnect();
    super.disconnectedCallback();
  }

  updated() {
    this._fit();
    this._placeTimer();
    // The canvas can change size after a render (a chart's svg lays out, fonts arrive): watch it.
    const canvas = this.renderRoot.querySelector('.canvas');
    if (canvas !== this._observed) {
      this._resizeObserver ??= new ResizeObserver(() => this._fit());
      this._resizeObserver.disconnect();
      this._observed = canvas;
      if (canvas) this._resizeObserver.observe(canvas);
    }
  }

  // Scales the canvas to the window.
  _fit() {
    const stage = this.renderRoot.querySelector('.stage');
    const canvas = this.renderRoot.querySelector('.canvas');
    if (!stage || !canvas) return;
    const next = fitScale(
      canvas.offsetWidth,
      canvas.offsetHeight,
      stage.clientWidth,
      stage.clientHeight,
    );
    if (Math.abs(next - this.scale) > 0.004 || !canvas.classList.contains('fitted')) {
      canvas.style.transform = `scale(${next})`; // now, not after the next render
      canvas.classList.add('fitted');
      this.scale = next;
    }
  }

  _hello() {
    this.hasOpener = !!window.opener && !window.opener.closed;
    if (this.hasOpener) window.opener.postMessage(helloMessage(this._rev), '*');
  }

  _block({ role, html: markup }) {
    return html`<div class="pb pb-${role}">${unsafeHTML(sanitizeHtml(markup))}</div>`;
  }

  // The timer, drawn over the round map's traveler: a ring that runs down around it, the seconds
  // under it. In the last five seconds it turns red; in the last three the screen beats with it
  // (the pulse layer is keyed by the second, so the animation restarts on every tick). When time
  // is up the ring goes and only a small tag stays, so nothing takes room from the results.
  _timer(t) {
    const running = t.state === 'running';
    const urgent = running && t.seconds <= 5;
    const beating = running && t.seconds >= 1 && t.seconds <= 3;
    const fraction = t.state === 'idle' ? 1 : Math.max(0, Math.min(1, t.seconds / t.duration));
    const label = t.state === 'done' ? t.label || 'Время вышло' : t.label;
    return html`
      <div
        class="trail-timer ${t.state} ${urgent ? 'urgent' : ''} ${beating ? 'beating' : ''}"
        role="timer"
        aria-label="Таймер"
        data-testid="projector-timer"
        data-state=${t.state}
        data-urgent=${urgent ? 'yes' : 'no'}
      >
        ${
          t.state === 'done'
            ? nothing
            : html`<div class="timer-ring">
                <svg viewBox="0 0 168 168" aria-hidden="true">
                  <circle class="track" cx="84" cy="84" r=${RING_R}></circle>
                  <circle class="bar" cx="84" cy="84" r=${RING_R}
                    stroke-dasharray=${RING_LENGTH} stroke-dashoffset=${RING_LENGTH * (1 - fraction)}></circle>
                </svg>
              </div>`
        }
        ${beating ? keyed(t.seconds, html`<span class="ripple"></span><span class="ripple r2"></span>`) : nothing}
        <div class="timer-badge">
          <span class="timer-time">${formatTimer(t.seconds)}</span>
          <span class="timer-label">${label}</span>
        </div>
        <span class="sr-only" aria-live="polite">${t.state === 'done' ? 'Время вышло' : ''}</span>
      </div>
    `;
  }

  // Puts the timer over the traveler on the round map. The traveler's position is in the trail
  // svg's own units (its inline transform); the map is scaled to its column, so convert.
  _placeTimer() {
    const timer = this.renderRoot.querySelector('.trail-timer');
    if (!timer) return;
    const rail = this.renderRoot.querySelector('.game-rail');
    const wrap = rail?.querySelector('.trail-svg-wrap');
    const svgEl = wrap?.querySelector('svg');
    const traveler = wrap?.querySelector('.trail-traveler');
    const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/.exec(
      traveler?.getAttribute('style') ?? '',
    );
    const box = svgEl?.viewBox?.baseVal;
    if (!m || !box?.width || !svgEl.clientWidth) return;
    const k = svgEl.clientWidth / box.width;
    // where the map's box is inside the rail, in the canvas's own (unscaled) pixels
    const scale = this.scale || 1;
    const railBox = rail.getBoundingClientRect();
    const wrapBox = wrap.getBoundingClientRect();
    const originX = (wrapBox.left - railBox.left) / scale;
    const originY = (wrapBox.top - railBox.top) / scale;
    timer.style.left = `${originX + Number(m[1]) * k}px`;
    timer.style.top = `${originY + Number(m[2]) * k}px`;
    if (!timer.classList.contains('placed')) {
      timer.classList.add('placed');
      // move smoothly from step to step, but not on the first appearance
      requestAnimationFrame(() => timer.classList.add('animated'));
    }
  }

  _meta(gameId) {
    const game = GAMES.find((g) => g.id === gameId);
    if (!game) return nothing;
    const rows = [
      ['Время', game.time],
      ['Формат', STRUCTURE[game.structure]?.label],
      ['Направление', CATEGORY[game.category]?.label],
    ].filter(([, v]) => v);
    return html`<dl class="meta-row" data-testid="projector-meta">
      ${rows.map(([k, v]) => html`<div class="meta-card"><dt>${k}</dt><dd>${v}</dd></div>`)}
    </dl>`;
  }

  _entries(e) {
    const pct = e.total ? Math.min(100, (e.filled / e.total) * 100) : 0;
    let body;
    if (!e.rows.length) {
      body = html`<p class="entries-empty">Ответы появятся здесь по мере внесения.</p>`;
    } else if (e.anonymous) {
      // sorted by value: the order tells nothing about who wrote what
      const rows = e.rows.slice().sort((a, b) => (a.key ?? Infinity) - (b.key ?? Infinity));
      body = html`<div class="anon-tiles">
        ${rows.map((r) => html`<div class="anon-tile"><small>${r.cells[0].label}</small><b>${r.cells[0].value}</b></div>`)}
      </div>`;
    } else {
      body = html`<div class="entry-cards">
        ${repeat(
          e.rows,
          (r) => r.who.join('|'),
          (r) => html`
            <div class="entry-card">
              <div class="entry-who">
                ${
                  r.who.length === 2
                    ? html`<div class="pair">${person(r.who[0])}${person(r.who[1])}</div>`
                    : person(r.who[0])
                }
                ${r.tag ? html`<div class="entry-tag">${r.tag}</div>` : nothing}
              </div>
              <div class="entry-cells">
                ${r.cells.map((c) => html`<span class="ec-cell"><small>${c.label}</small><b>${c.value}</b></span>`)}
              </div>
            </div>
          `,
        )}
      </div>`;
    }
    return html`
      <section class="entries" data-testid="projector-entries" data-anonymous=${e.anonymous ? 'yes' : 'no'}>
        <div class="entries-head">
          <h3 class="roster-title">${e.title}</h3>
          <div class="entries-count"><b>${e.filled}</b> из ${e.total} ${e.unit}</div>
        </div>
        <div class="entries-track"><div style="width:${pct}%"></div></div>
        ${body}
      </section>
    `;
  }

  _roster(r, compact = false) {
    if (r.kind === 'groups') {
      return html`
        <section class="roster ${compact ? 'compact' : ''}" data-testid="projector-roster" data-kind="groups">
          <h3 class="roster-title">${r.title}</h3>
          <div
            class="role-groups ${r.groups.length > 2 ? 'many' : ''}"
            style="--cols:${r.groups.length <= 4 ? r.groups.length : Math.ceil(r.groups.length / 2)}"
          >
            ${r.groups.map(
              (g) => html`
                <div class="role-group-col role-group-${g.tone}">
                  <div class="role-group-title">${g.label}</div>
                  <div class="role-group-count">${g.names.length} чел.</div>
                  <div class="role-group-chips">
                    ${g.names.map((n) => html`<span class="role-chip readonly">${person(n)}</span>`)}
                  </div>
                </div>
              `,
            )}
          </div>
        </section>
      `;
    }
    return html`
      <section class="roster ${compact ? 'compact' : ''}" data-testid="projector-roster" data-kind="pairs">
        <h3 class="roster-title">${r.title}</h3>
        <div class="role-pairs">
          ${r.pairs.map(
            (p) => html`
              <div class="role-pair-card ${p.trio ? 'role-pair-trio' : ''}">
                ${p.trio ? html`<span class="role-pair-trio-badge">трио</span>` : nothing}
                <div class="role-pair-side left">
                  <span class="role-pair-name">${person(p.a)}</span>
                  ${p.tagA ? html`<div class="role-pair-label">${p.tagA}</div>` : nothing}
                </div>
                <div class="role-pair-vs">↔</div>
                <div class="role-pair-side right">
                  <span class="role-pair-name">${person(p.b)}</span>
                  ${p.tagB ? html`<div class="role-pair-label">${p.tagB}</div>` : nothing}
                </div>
              </div>
            `,
          )}
        </div>
      </section>
    `;
  }

  _waiting() {
    const s = this.snapshot;
    return html`<retro-projector-welcome
      .participants=${s.participants ?? []}
      .people=${s.people ?? []}
      .hasOpener=${this.hasOpener}
    ></retro-projector-welcome>`;
  }

  render() {
    const s = this.snapshot;
    if (s.kind !== 'game') return this._waiting();
    const head = s.blocks.filter((b) => HEAD_ROLES.includes(b.role));
    const rest = s.blocks.filter((b) => !HEAD_ROLES.includes(b.role));
    const wide = rest.some((b) => b.role === 'chart');
    const width = wide ? WIDE_CANVAS_WIDTH : CANVAS_WIDTH;
    // Nothing public in this step (the facilitator is typing answers in): say so instead of a blank page.
    const quiet =
      !s.timer && !s.roster && !s.entries && !s.blocks.some((b) => b.role !== 'eyebrow');
    // the end-of-game leaderboard (src/leaderboard.js) spans the full width under the
    // results — squeezed into the narrow column next to a chart it would be one long list
    const isBoard = (b) => b.role === 'body' && b.html.includes('class="leaderboard"');
    const boards = wide ? rest.filter(isBoard) : [];
    const left = rest.filter((b) => b.role !== 'chart' && !boards.includes(b));
    const right = rest.filter((b) => b.role === 'chart');
    const stacked = wide && right.length === 1 && chartAspect(right[0].html) <= SHORT_CHART;
    const meta = s.step.index === 0 ? this._meta(s.gameId) : nothing;
    const t = s.timer;
    const beat = t?.state === 'running' && t.seconds >= 1 && t.seconds <= 3;
    const pulse = beat
      ? keyed(t.seconds, html`<div class="pulse beat" data-testid="projector-pulse"></div>`)
      : t?.state === 'done'
        ? html`<div class="pulse final" data-testid="projector-final"></div>`
        : nothing;
    return html`
      <div class="stage" style=${s.accent} data-testid="projector-stage" data-game=${s.gameId}>
        <div class="canvas round-body" style="width:${width}px;transform:scale(${this.scale})">
          <div class="game-shell">
            <div class="game-main">
              ${keyed(
                `${s.gameId}:${s.step.index}`,
                html`<div class="content-enter">
              <h2 class="sr-only" data-testid="projector-step">Шаг ${s.step.index + 1} из ${s.step.total} · ${s.step.title}</h2>
              ${head.map((b) => this._block(b))}
              ${meta}
              ${
                stacked
                  ? html`<div class="results-stack">${left.map((b) => this._block(b))}${right.map((b) => this._block(b))}</div>`
                  : wide
                    ? html`<div class="wide-grid">
                      <div>${s.roster ? this._roster(s.roster) : nothing}${left.map((b) => this._block(b))}</div>
                      <div>${right.map((b) => this._block(b))}</div>
                    </div>`
                    : html`${left.map((b) => this._block(b))}${s.roster ? this._roster(s.roster, !!s.entries) : nothing}${s.entries ? this._entries(s.entries) : nothing}`
              }
              ${boards.map((b) => this._block(b))}
              ${
                quiet
                  ? html`<div class="hold" data-testid="projector-hold"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>Минутку — ведущий готовит следующий шаг.</div>`
                  : nothing
              }
              </div>`,
              )}
            </div>
            <aside class="game-rail">
              <div class="game-rail-title">${s.gameName}</div>
              ${renderTrail({ current: s.step.index, total: s.step.total, gameId: s.gameId })}
              ${s.timer ? this._timer(s.timer) : nothing}
            </aside>
          </div>
        </div>
        ${pulse}
      </div>
    `;
  }
}

customElements.define('retro-projector', RetroProjector);
