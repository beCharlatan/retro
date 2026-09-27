/* =========================================================
   ROUTER: dispatches a game id (from a home-screen card click,
   the "🎲 Случайная игра" button, etc.) to that game's custom
   element, mounting its tag into #app.

   Every game is a Lit/Shadow DOM custom element (see
   docs/modernization-plan.md Phase 2/3) — this file used to also
   carry render*Game() function calls for the still-legacy games
   during the incremental migration; that's done now.
========================================================= */
import './games/anchoring.js';
import './games/availability.js';
import './games/barnum.js';
import './games/beauty-contest.js';
import './games/beer-game.js';
import './games/calibration.js';
import './games/crowd-wisdom.js';
import './games/dictator.js';
import './games/dollar-auction.js';
import './games/el-farol.js';
import './games/endowment.js';
import './games/false-consensus.js';
import './games/framing.js';
import './games/hidden-profile.js';
import './games/lemons.js';
import './games/planning-fallacy.js';
import './games/prisoners-dilemma.js';
import './games/public-goods.js';
import './games/ultimatum.js';
import './games/volunteer.js';
import './games/weakest-link.js';
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
  'weakest-link': 'retro-game-weakest-link',
  volunteer: 'retro-game-volunteer',
  'hidden-profile': 'retro-game-hidden-profile',
  'dollar-auction': 'retro-game-dollar-auction',
  lemons: 'retro-game-lemons',
  'beauty-contest': 'retro-game-beauty-contest',
  'el-farol': 'retro-game-el-farol',
  'beer-game': 'retro-game-beer-game',
};

export function openGame(id) {
  const tag = GAME_TAGS[id];
  if (tag) mountElement(tag);
}
