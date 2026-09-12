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
import { renderBarnumGame } from './games/barnum.js';
import { renderCalibrationGame } from './games/calibration.js';
import { renderCrowdWisdomGame } from './games/crowd-wisdom.js';
import './games/dictator.js'; // side effect: customElements.define('retro-game-dictator', ...)
import { renderEndowmentGame } from './games/endowment.js';
import { renderFalseConsensusGame } from './games/false-consensus.js';
import { renderFramingGame } from './games/framing.js';
import { renderPlanningFallacyGame } from './games/planning-fallacy.js';
import { renderPrisonersDilemmaGame } from './games/prisoners-dilemma.js';
import './games/public-goods.js'; // side effect: customElements.define('retro-game-public-goods', ...)
import { renderUltimatumGame } from './games/ultimatum.js';
import { app } from './state.js';

// Mounts a custom element by tag name into #app, replacing whatever
// was there before (same net effect as a legacy game's
// `app.innerHTML = \`...\``).
function mountElement(tag) {
  app.replaceChildren(document.createElement(tag));
}

const GAME_RENDERERS = {
  anchoring: () => mountElement('retro-game-anchoring'),
  'crowd-wisdom': () => renderCrowdWisdomGame(),
  dictator: () => mountElement('retro-game-dictator'),
  'public-goods': () => mountElement('retro-game-public-goods'),
  'false-consensus': () => renderFalseConsensusGame(),
  barnum: () => renderBarnumGame(),
  availability: () => renderAvailabilityGame(),
  'planning-fallacy': () => renderPlanningFallacyGame(),
  ultimatum: () => renderUltimatumGame(),
  'prisoners-dilemma': () => renderPrisonersDilemmaGame(),
  endowment: () => renderEndowmentGame(),
  framing: () => renderFramingGame(),
  calibration: () => renderCalibrationGame(),
};

export function openGame(id) {
  const fn = GAME_RENDERERS[id];
  if (fn) fn();
}
