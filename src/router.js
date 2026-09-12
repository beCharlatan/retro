/* =========================================================
   ROUTER: dispatches a game id (from a home-screen card click,
   the "🎲 Случайная игра" button, etc.) to that game's own
   render*Game() function, imported from src/games/ — OR, for a
   game that's been migrated to a Lit/Shadow DOM custom element
   (see docs/modernization-plan.md Phase 2+), mounts its tag into
   #app instead. Both kinds live side by side here during the
   incremental, one-game-at-a-time migration.
========================================================= */
import './games/anchoring.js'; // side effect: customElements.define('retro-game-anchoring', ...)
import { renderAvailabilityGame } from './games/availability.js';
import './games/barnum.js'; // side effect: customElements.define('retro-game-barnum', ...)
import { renderCalibrationGame } from './games/calibration.js';
import './games/crowd-wisdom.js'; // side effect: customElements.define('retro-game-crowd-wisdom', ...)
import './games/dictator.js'; // side effect: customElements.define('retro-game-dictator', ...)
import { renderEndowmentGame } from './games/endowment.js';
import './games/false-consensus.js'; // side effect: customElements.define('retro-game-false-consensus', ...)
import { renderFramingGame } from './games/framing.js';
import { renderPlanningFallacyGame } from './games/planning-fallacy.js';
import './games/prisoners-dilemma.js'; // side effect: customElements.define('retro-game-prisoners-dilemma', ...)
import './games/public-goods.js'; // side effect: customElements.define('retro-game-public-goods', ...)
import './games/ultimatum.js'; // side effect: customElements.define('retro-game-ultimatum', ...)
import { app } from './state.js';

// Mounts a custom element by tag name into #app, replacing whatever
// was there before (same net effect as a legacy game's
// `app.innerHTML = \`...\``).
function mountElement(tag) {
  app.replaceChildren(document.createElement(tag));
}

const GAME_RENDERERS = {
  anchoring: () => mountElement('retro-game-anchoring'),
  'crowd-wisdom': () => mountElement('retro-game-crowd-wisdom'),
  dictator: () => mountElement('retro-game-dictator'),
  'public-goods': () => mountElement('retro-game-public-goods'),
  'false-consensus': () => mountElement('retro-game-false-consensus'),
  barnum: () => mountElement('retro-game-barnum'),
  availability: () => renderAvailabilityGame(),
  'planning-fallacy': () => renderPlanningFallacyGame(),
  ultimatum: () => mountElement('retro-game-ultimatum'),
  'prisoners-dilemma': () => mountElement('retro-game-prisoners-dilemma'),
  endowment: () => renderEndowmentGame(),
  framing: () => renderFramingGame(),
  calibration: () => renderCalibrationGame(),
};

export function openGame(id) {
  const fn = GAME_RENDERERS[id];
  if (fn) fn();
}
