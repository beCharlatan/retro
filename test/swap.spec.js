// test/swap.spec.js
// The "click two people to swap them" feature added on top of the
// existing full-reshuffle button (Roles.bindPairSwap / bindGroupSwap).
// Covers one pair-based game (Ультиматум) and one group-based game
// (Эффект владения) — both share the exact same Roles helpers, so this
// isn't testing per-game code, it's testing roles.js itself through two
// real screens.

const { Report, openPage, withBrowser, openGameFromHome } = require('./lib');

async function run() {
  const report = new Report();
  report.section('Point-to-point swap (pairs & groups)');

  await withBrowser(async (browser) => {
    // --- pairs: Ультиматум ---
    {
      const page = await openPage(browser, report);
      await openGameFromHome(page, 'ultimatum');
      await page.click('button:has-text("Распределить пары")');
      await page.waitForTimeout(120);

      const before = await page.$$eval('.role-pair-name', (els) => els.map((e) => e.textContent));

      await page.click('.role-pair-name >> nth=0');
      await page.waitForTimeout(80);
      const selectedClass = await page.getAttribute('.role-pair-name >> nth=0', 'class');
      report.check(
        'pairs: first click marks the person as selected',
        selectedClass?.includes('swap-selected'),
        selectedClass,
      );

      await page.click('.role-pair-name >> nth=2'); // a person from a different pair
      await page.waitForTimeout(120);
      const after = await page.$$eval('.role-pair-name', (els) => els.map((e) => e.textContent));

      report.check(
        'pairs: the two clicked people swapped positions',
        after[0] === before[2] && after[2] === before[0],
        `${before} -> ${after}`,
      );
      report.check(
        'pairs: everyone else stayed put',
        JSON.stringify(after.slice(4)) === JSON.stringify(before.slice(4)),
      );

      const stillSelected = await page.$$eval('.swap-selected', (els) => els.length);
      report.check('pairs: selection clears after a successful swap', stillSelected === 0);

      // click-same-twice cancels without swapping
      const beforeCancel = await page.$$eval('.role-pair-name', (els) =>
        els.map((e) => e.textContent),
      );
      await page.click('.role-pair-name >> nth=1');
      await page.click('.role-pair-name >> nth=1');
      await page.waitForTimeout(80);
      const afterCancel = await page.$$eval('.role-pair-name', (els) =>
        els.map((e) => e.textContent),
      );
      const noSwapHappened = JSON.stringify(beforeCancel) === JSON.stringify(afterCancel);
      const nothingSelected = (await page.$$eval('.swap-selected', (els) => els.length)) === 0;
      report.check(
        'pairs: clicking the same person twice cancels (no swap)',
        noSwapHappened && nothingSelected,
      );

      await page.close();
    }

    // --- groups: Эффект владения ---
    {
      const page = await openPage(browser, report);
      await openGameFromHome(page, 'endowment');
      await page.click('button:has-text("Распределить группы")');
      await page.waitForTimeout(120);

      const aBefore = await page.$$eval('.role-group-a .role-chip', (els) =>
        els.map((e) => e.textContent),
      );
      const bBefore = await page.$$eval('.role-group-b .role-chip', (els) =>
        els.map((e) => e.textContent),
      );

      await page.click('.role-group-a .role-chip >> nth=0');
      await page.waitForTimeout(80);
      await page.click('.role-group-b .role-chip >> nth=0');
      await page.waitForTimeout(120);

      const aAfter = await page.$$eval('.role-group-a .role-chip', (els) =>
        els.map((e) => e.textContent),
      );
      const bAfter = await page.$$eval('.role-group-b .role-chip', (els) =>
        els.map((e) => e.textContent),
      );

      report.check(
        'groups: sizes stay balanced after a swap',
        aAfter.length === aBefore.length && bAfter.length === bBefore.length,
        `A: ${aBefore.length}->${aAfter.length}, B: ${bBefore.length}->${bAfter.length}`,
      );
      report.check(
        'groups: the two clicked people actually swapped sides',
        aAfter[0] === bBefore[0] && bAfter[0] === aBefore[0],
        `A[0] ${aBefore[0]}->${aAfter[0]}, B[0] ${bBefore[0]}->${bAfter[0]}`,
      );

      // swapping two people within the SAME group is a documented no-op
      const aBeforeNoop = await page.$$eval('.role-group-a .role-chip', (els) =>
        els.map((e) => e.textContent),
      );
      await page.click('.role-group-a .role-chip >> nth=0');
      await page.click('.role-group-a .role-chip >> nth=1');
      await page.waitForTimeout(100);
      const aAfterNoop = await page.$$eval('.role-group-a .role-chip', (els) =>
        els.map((e) => e.textContent),
      );
      report.check(
        'groups: swapping within the same group is a no-op',
        JSON.stringify(aBeforeNoop) === JSON.stringify(aAfterNoop),
      );

      await page.close();
    }
  });

  return report;
}

module.exports = { run };

if (require.main === module) {
  run().then((r) => process.exit(r.summary() ? 0 : 1));
}
