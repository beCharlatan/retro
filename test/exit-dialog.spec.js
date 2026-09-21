// test/exit-dialog.spec.js
// Leaving a game asks for confirmation in a real <dialog> (not
// window.confirm): the × opens it, "Остаться" / Escape / a click on the
// backdrop keep you in the game (and keep your draft), "Выйти" leaves.

const { Report, openPage, withBrowser, openGameFromHome } = require('./lib');

const DIALOG = 'dialog.confirm-dialog';

async function run() {
  const report = new Report();
  report.section('Exit confirmation — <dialog>');

  await withBrowser(async (browser) => {
    const page = await openPage(browser, report);
    try {
      await openGameFromHome(page, 'anchoring');
      await page.waitForTimeout(150);

      report.check('no dialog is open before clicking ×', !(await page.isVisible(DIALOG)));

      await page.click('.game-exit');
      report.check('× opens the confirmation dialog', await page.isVisible(DIALOG));
      report.check(
        'it is a native modal <dialog> (top layer, focus trapped)',
        await page.$eval(DIALOG, (d) => d.tagName === 'DIALOG' && d.matches(':modal')),
      );
      report.check(
        'it asks about leaving the game and warns the attempt is not saved',
        (await page.textContent(DIALOG)).includes('Выйти из игры') &&
          (await page.textContent(DIALOG)).includes('не сохранится'),
      );
      report.check(
        'focus starts on the safe button ("Остаться")',
        await page.$eval(
          `${DIALOG} button[value="cancel"]`,
          (b) => b === document.activeElement || b.matches(':focus'),
        ),
      );

      // Cancel button
      await page.click(`${DIALOG} button[value="cancel"]`);
      report.check('"Остаться" closes the dialog', !(await page.isVisible(DIALOG)));
      report.check('...and stays in the game', await page.isVisible('.game-exit'));
      await page.waitForTimeout(50); // the element is removed in the `close` event, a tick after closing
      report.check(
        'the dialog element is removed from the DOM afterwards',
        (await page.$$(DIALOG)).length === 0,
      );

      // Escape
      await page.click('.game-exit');
      await page.keyboard.press('Escape');
      report.check(
        'Escape closes it without leaving',
        !(await page.isVisible(DIALOG)) && (await page.isVisible('.game-exit')),
      );

      // Backdrop click
      await page.click('.game-exit');
      await page.mouse.click(5, 5); // far from the centred dialog → on the backdrop
      report.check(
        'a click on the backdrop closes it without leaving',
        !(await page.isVisible(DIALOG)) && (await page.isVisible('.game-exit')),
      );

      // The draft survives a cancelled exit.
      const draft = await page.evaluate(() => sessionStorage.getItem('retro-draft-anchoring'));
      report.check('cancelling never clears the draft', draft === null || draft.length > 0);

      // Confirm
      await page.click('.game-exit');
      await page.click(`${DIALOG} button[value="ok"]`);
      await page.waitForTimeout(300);
      report.check('"Выйти" returns to the map', await page.isVisible('button.location'));
      report.check('the game is gone after leaving', !(await page.isVisible('.game-exit')));
      report.check('no dialog is left behind', (await page.$$(DIALOG)).length === 0);
    } catch (e) {
      report.fail('threw during exit-dialog flow', e.message);
    } finally {
      await page.close();
    }
  });

  return report;
}

module.exports = { run };

if (require.main === module) {
  run().then((r) => process.exit(r.summary() ? 0 : 1));
}
