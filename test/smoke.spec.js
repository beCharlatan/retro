// test/smoke.spec.js
// For every game: open it from the home screen, click through to the
// data-entry screen, fill every field, reach results, sanity-check the
// reveal number rendered, continue to the context screen, and return
// home via the breadcrumb. Fails loudly (with the game name) the moment
// any step doesn't behave as expected — this is the test to run after
// any styles.css or app.js change to catch a broken selector fast.

const { Report, openPage, withBrowser, openGameFromHome, exitToHome } = require('./lib');
const { GAMES } = require('./games');

async function run() {
  const report = new Report();
  report.section('Smoke — every game, full flow');

  await withBrowser(async (browser) => {
    for (const game of GAMES) {
      const page = await openPage(browser, report);
      try {
        await openGameFromHome(page, game.id);
        await page.waitForTimeout(100);

        // .game-crumb/.crumb-current are gone (src/game-shell.js) — the
        // game's name now sits in .game-rail-title next to the map.
        const crumb = await page.textContent('.game-rail-title').catch(() => null);
        report.check(
          `${game.name}: rail title shows game name`,
          crumb && crumb.trim() === game.name,
          crumb,
        );

        await game.toEntryScreen(page);
        await page.waitForTimeout(100);

        const filled = await game.fill(page, {});
        report.check(`${game.name}: fill() populated fields`, filled > 0, `filled=${filled}`);

        await game.toResults(page);
        await page.waitForTimeout(200);

        const revealVisible = await page.isVisible('.reveal .n').catch(() => false);
        report.check(`${game.name}: results screen shows a reveal number`, revealVisible);

        const resultsOk = await game.verifyResults(page).catch(() => false);
        report.check(`${game.name}: reveal content looks sane`, resultsOk);

        const tableRows = await page.$$('.results-table tbody tr').catch(() => []);
        report.check(
          `${game.name}: results table has rows`,
          tableRows.length > 0,
          `rows=${tableRows.length}`,
        );

        await page.click('button:has-text("Что это было")');
        await page.waitForTimeout(100);
        // .screen.active is gone — every round (src/game-shell.js's
        // <section class="round">) is always in the DOM now, not just
        // one "active" one. Every game's rounds go <h1> (intro) ... <h2>
        // (middle rounds) ... <h1> (context, last) — so the LAST <h1> in
        // .game-main is reliably the context round's title regardless
        // of how many rounds the game has.
        const h1s = await page.$$eval('.game-main h1', (els) =>
          els.map((e) => e.textContent.trim()),
        );
        const contextH1 = h1s[h1s.length - 1] || '';
        report.check(
          `${game.name}: context screen reveals a title`,
          contextH1.length > 0,
          contextH1,
        );

        await exitToHome(page);
        const home = await page.textContent('h1').catch(() => '');
        report.check(
          `${game.name}: back-link returns to home`,
          home.includes('5 минут общего развития'),
        );
      } catch (e) {
        report.fail(`${game.name}: threw during smoke flow`, e.message);
      } finally {
        await page.close();
      }
    }
  });

  return report;
}

module.exports = { run };

if (require.main === module) {
  run().then((r) => process.exit(r.summary() ? 0 : 1));
}
