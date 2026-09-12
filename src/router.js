/* =========================================================
   ROUTER: dispatches a game id (from a home-screen card click,
   the "🎲 Случайная игра" button, etc.) to that game's own
   render*Game() function, imported from src/games/.
========================================================= */
import { renderAnchoringGame } from './games/anchoring.js';
import { renderAvailabilityGame } from './games/availability.js';
import { renderBarnumGame } from './games/barnum.js';
import { renderCalibrationGame } from './games/calibration.js';
import { renderCrowdWisdomGame } from './games/crowd-wisdom.js';
import { renderDictatorGame } from './games/dictator.js';
import { renderEndowmentGame } from './games/endowment.js';
import { renderFalseConsensusGame } from './games/false-consensus.js';
import { renderFramingGame } from './games/framing.js';
import { renderPlanningFallacyGame } from './games/planning-fallacy.js';
import { renderPrisonersDilemmaGame } from './games/prisoners-dilemma.js';
import { renderPublicGoodsGame } from './games/public-goods.js';
import { renderUltimatumGame } from './games/ultimatum.js';

const GAME_RENDERERS = {
  anchoring: () => renderAnchoringGame(),
  'crowd-wisdom': () => renderCrowdWisdomGame(),
  dictator: () => renderDictatorGame(),
  'public-goods': () => renderPublicGoodsGame(),
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
