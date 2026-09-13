// test/smoke.spec.js
// For every game: open it from the home screen, click through to the
// data-entry screen, fill every field, reach results, sanity-check the
// reveal number rendered, continue to the context screen, and return
// home via the breadcrumb. Fails loudly (with the game name) the moment
// any step doesn't behave as expected — this is the test to run after
// any styles.css or app.js change to catch a broken selector fast.

const { Report, openPage, withBrowser } = require('./lib');
const { GAMES } = require('./games');

async function run() {
  const report = new Report();
  report.section('Smoke — every game, full flow');

  await withBrowser(async (browser) => {
    for (const game of GAMES) {
      const page = await openPage(browser, report);
      try {
        await page.click(`text=${game.name}`);
        await page.waitForTimeout(100);

        const crumb = await page.textContent('.crumb-current').catch(() => null);
        report.check(
          `${game.name}: breadcrumb shows game name`,
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
        const contextH1 = await page.textContent('.screen.active h1').catch(() => '');
        report.check(
          `${game.name}: context screen reveals a title`,
          contextH1 && contextH1.trim().length > 0,
          contextH1,
        );

        await page.click('button:has-text("Все игры")');
        await page.waitForTimeout(80);
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
