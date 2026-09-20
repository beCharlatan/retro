/* =========================================================
   ENTRY POINT
   =========================================================
   State, avatar helpers, the game list and the home screen used to
   all live in this one file (see git history pre-2026-09 / the ESM
   migration in docs/modernization-plan.md Phase 1) — now split into
   state.js / toast.js / home.js / router.js. This
   file is just the boot sequence Bun.build() takes as its entrypoint.
========================================================= */

import { renderHome } from './home.js';
import { initPerf } from './perf.js';

initPerf();
renderHome();
