// test/lib.js
// Shared helpers for the retro regression suite. Kept dependency-light
// (just Playwright) so the whole suite runs with a single `node` command
// and no test framework to install.

const path = require('node:path');
const { chromium } = require('playwright');

const DIST_PATH = path.join(__dirname, '..', 'dist', 'index.html');
const DIST_URL = `file://${DIST_PATH}`;

// Collects failures across the whole run so run-all.js can print one
// summary and exit non-zero if anything broke.
class Report {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.failures = [];
  }
  ok(label) {
    this.passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  }
  fail(label, detail) {
    this.failed++;
    this.failures.push({ label, detail });
    console.log(`  \x1b[31m✗\x1b[0m ${label}${detail ? `  — ${detail}` : ''}`);
  }
  check(label, condition, detail) {
    if (condition) this.ok(label);
    else this.fail(label, detail);
  }
  section(title) {
    console.log(`\n${title}`);
  }
  summary() {
    const total = this.passed + this.failed;
    console.log(`\n${'─'.repeat(50)}`);
    if (this.failed === 0) {
      console.log(`\x1b[32mAll ${total} checks passed.\x1b[0m`);
    } else {
      console.log(`\x1b[31m${this.failed} of ${total} checks failed:\x1b[0m`);
      this.failures.forEach((f) => {
        console.log(`  - ${f.label}${f.detail ? `: ${f.detail}` : ''}`);
      });
    }
    return this.failed === 0;
  }
}

// Opens a fresh page against dist/index.html, wired to fail the report on
// any uncaught JS error or console.error (excluding the expected 403 from
// Google Fonts, which has no network access in this sandbox).
async function openPage(browser, report, viewport) {
  const page = await browser.newPage({
    viewport: viewport || { width: 1000, height: 1300 },
    // The map's idle "drifting island" wobble (src/styles/map-styles.css)
    // is a continuous CSS animation on every location button — great
    // for a human, but it means the button's bounding box never settles,
    // which fails Playwright's actionability "element is stable" check
    // on click/hover. The map already honors `prefers-reduced-motion`
    // (disables the animation outright), so telling every test context
    // to prefer reduced motion is the standard, correct fix here — not
    // a workaround bolted onto the feature.
    reducedMotion: 'reduce',
  });
  page.on('pageerror', (e) => report.fail('no uncaught JS errors', String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('403')) {
      report.fail('no console errors', msg.text());
    }
  });
  await page.goto(DIST_URL);
  return page;
}

async function withBrowser(fn) {
  const browser = await chromium.launch();
  try {
    await fn(browser);
  } finally {
    await browser.close();
  }
}

// Opens a game from the map home screen. A click no longer navigates
// straight there (src/home.js) — it only selects/focuses that
// location and opens its agenda panel; "Начать игру" inside the panel
// is what actually starts the game. Only the location's icon is
// visible chrome now (src/map-render.js), so this selects by
// `data-game-id` rather than matching visible name text the way the
// pre-map home screen's cards used to.
//
// Under reducedMotion (see openPage() above), src/map-render.js skips
// its camera-fly/dive transitions almost entirely (0-duration, or no
// transition at all for the final dive), so the short waits here are
// just enough for Lit's reactive re-render and the transition's own
// scheduling to settle — not real animation time.
async function openGameFromHome(page, gameId) {
  await page.click(`[data-game-id="${gameId}"]`);
  await page.waitForTimeout(200);
  await page.click('button:has-text("Начать игру")');
  await page.waitForTimeout(200);
}

// Leaves the current game and returns to the map via the × in the
// corner (src/game-shell.js's confirmExit() — replaced the old
// .game-crumb "← Все игры" back-link everywhere, see that file).
// confirmExit() opens a native window.confirm() first; Playwright
// auto-dismisses any dialog it doesn't otherwise handle (equivalent to
// clicking Cancel, so confirm() returns false and the click would
// silently no-op) — registering an accept handler right before the
// click is what makes this behave like a real user clicking "OK".
async function exitToHome(page) {
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('.game-exit');
  await page.waitForTimeout(150);
}

module.exports = {
  DIST_PATH,
  DIST_URL,
  Report,
  openPage,
  withBrowser,
  openGameFromHome,
  exitToHome,
};
