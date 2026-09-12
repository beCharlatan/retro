// test/pdf.spec.js
// Confirms every game's results screen populates its print-only header
// (game name, subtitle, participant count) and footer (a longer
// "what this was" explanation, since the printed sheet has plenty of
// room below the table) before Print.run() would be invoked, that the
// export button itself is present and hidden from print output, and
// that document.title (which browsers use to suggest a filename in
// the "Save as PDF" dialog) switches to "Game_Name_DD.MM.YYYY" for the
// moment of printing and restores afterwards. Doesn't actually invoke
// the OS print dialog (Playwright has no reliable hook for that) —
// stubs window.print() and emulates print media instead.

const { Report, openPage, withBrowser } = require('./lib');
const { GAMES } = require('./games');

async function run() {
  const report = new Report();
  report.section('PDF export — print header + footer on every results screen');

  await withBrowser(async (browser) => {
    for (const game of GAMES) {
      const page = await openPage(browser, report);
      try {
        await page.click(`text=${game.name}`);
        await page.waitForTimeout(100);
        await game.toEntryScreen(page);
        await page.waitForTimeout(100);
        await game.fill(page, {});
        await game.toResults(page);
        await page.waitForTimeout(200);

        const mountId = `print-header-${game.id}`;
        const headerHTML = await page.$eval(`#${mountId}`, (el) => el.innerHTML).catch(() => '');
        report.check(`${game.name}: print header mounted with content`, headerHTML.length > 0);
        report.check(
          `${game.name}: print header includes the game name`,
          headerHTML.includes(game.name),
        );
        report.check(
          `${game.name}: print header includes a participant count`,
          /\d+\s+участник/.test(headerHTML),
          headerHTML.slice(0, 120),
        );

        const footerId = `print-footer-${game.id}`;
        const footerHTML = await page.$eval(`#${footerId}`, (el) => el.innerHTML).catch(() => '');
        report.check(
          `${game.name}: print footer mounted with an explanation`,
          footerHTML.length > 80,
          `len=${footerHTML.length}`,
        );
        report.check(
          `${game.name}: print footer has a visible title label`,
          footerHTML.includes('Что это было'),
        );

        const exportBtnVisible = await page.isVisible('#pdf-btn').catch(() => false);
        report.check(`${game.name}: export button visible on screen`, exportBtnVisible);

        // --- dynamic filename: document.title should become "Game_Name_DD.MM.YYYY"
        // for the moment of printing (the browser's Save-as-PDF dialog suggests
        // document.title as the filename), then restore once the dialog closes.
        const originalTitle = await page.title();
        await page.evaluate(() => {
          window.print = () => {};
        }); // no real dialog in headless
        await page.click('#pdf-btn');
        await page.waitForTimeout(80);
        const titleDuringPrint = await page.title();
        const today = new Date();
        const expectedDate = [
          String(today.getDate()).padStart(2, '0'),
          String(today.getMonth() + 1).padStart(2, '0'),
          today.getFullYear(),
        ].join('.');
        const expectedSlug = game.name.replace(/\s+/g, '_');
        report.check(
          `${game.name}: PDF filename includes game name + today's date`,
          titleDuringPrint === `${expectedSlug}_${expectedDate}`,
          titleDuringPrint,
        );

        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
        await page.waitForTimeout(80);
        const titleAfter = await page.title();
        report.check(
          `${game.name}: tab title restored after print dialog closes`,
          titleAfter === originalTitle,
          `${titleAfter} vs ${originalTitle}`,
        );

        await page.emulateMedia({ media: 'print' });
        await page.waitForTimeout(100);
        const headerVisibleInPrint = await page.isVisible(`#${mountId}`).catch(() => false);
        const footerVisibleInPrint = await page.isVisible(`#${footerId}`).catch(() => false);
        const btnHiddenInPrint = await page.isVisible('#pdf-btn').catch(() => true);
        report.check(`${game.name}: header visible in print media`, headerVisibleInPrint);
        report.check(`${game.name}: footer visible in print media`, footerVisibleInPrint);
        report.check(`${game.name}: export button hidden in print media`, !btnHiddenInPrint);

        // The whole point of putting the explanation on the sheet is that
        // it still has to fit a single A4 page alongside everything else.
        // $eval (not page.evaluate + document.querySelector) — pierces
        // open shadow roots, so this keeps working for a Shadow DOM Lit
        // game component too (see docs/modernization-plan.md Phase 2+).
        const contentHeight = await page.$eval('.wrap', (el) => el.scrollHeight);
        const A4_USABLE_PX = 1122 - 2 * 49; // 96dpi page height minus ~13mm top/bottom margins
        report.check(
          `${game.name}: printed content still fits one A4 page`,
          contentHeight < A4_USABLE_PX,
          `height=${contentHeight}px, limit=${A4_USABLE_PX}px`,
        );
      } catch (e) {
        report.fail(`${game.name}: threw during pdf flow`, e.message);
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
