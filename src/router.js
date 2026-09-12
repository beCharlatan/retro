/* =========================================================
   ROUTER: dispatches a game id (from a home-screen card click,
   the "🎲 Случайная игра" button, etc.) to that game's custom
   element, mounting its tag into #app.

   All 13 games are now Lit/Shadow DOM custom elements (see
   docs/modernization-plan.md Phase 2/3) — this file used to also
   carry render*Game() function calls for the still-legacy games
   during the incremental migration; that's done now.
========================================================= */
import './games/anchoring.js';
import './games/availability.js';
import './games/barnum.js';
import './games/calibration.js';
import './games/crowd-wisdom.js';
import './games/dictator.js';
import './games/endowment.js';
import './games/false-consensus.js';
import './games/framing.js';
import './games/planning-fallacy.js';
import './games/prisoners-dilemma.js';
import './games/public-goods.js';
import './games/ultimatum.js';
import { app } from './state.js';

// Mounts a custom element by tag name into #app, replacing whatever
// was there before (same net effect as the old
// `app.innerHTML = \`...\``).
function mountElement(tag) {
  app.replaceChildren(document.createElement(tag));
}

const GAME_TAGS = {
  anchoring: 'retro-game-anchoring',
  'crowd-wisdom': 'retro-game-crowd-wisdom',
  dictator: 'retro-game-dictator',
  'public-goods': 'retro-game-public-goods',
  'false-consensus': 'retro-game-false-consensus',
  barnum: 'retro-game-barnum',
  availability: 'retro-game-availability',
  'planning-fallacy': 'retro-game-planning-fallacy',
  ultimatum: 'retro-game-ultimatum',
  'prisoners-dilemma': 'retro-game-prisoners-dilemma',
  endowment: 'retro-game-endowment',
  framing: 'retro-game-framing',
  calibration: 'retro-game-calibration',
};

export function openGame(id) {
  const tag = GAME_TAGS[id];
  if (tag) mountElement(tag);
}
