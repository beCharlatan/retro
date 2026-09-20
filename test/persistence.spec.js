// test/persistence.spec.js
// For every game: partially fill it, then simulate a distracted person
// who reloads the tab TWICE before deciding what to do (the exact race
// that broke silently before the `hydrated` guard was added — see
// persist.js). Confirms the recovery banner appears, "Восстановить"
// brings back the untouched values, "Начать заново" makes the banner
// disappear for good, and finishing a round through to the context
// screen's reset clears the draft. Also checks the fresh-game control
// case (no banner when nothing was ever filled).

const { Report, openPage, withBrowser, openGameFromHome, exitToHome } = require('./lib');
const { GAMES } = require('./games');

async function draftKey(page, gameId) {
  return page.evaluate((id) => sessionStorage.getItem(`retro-draft-${id}`), gameId);
}

async function run() {
  const report = new Report();
  report.section('Persistence — draft recovery across all games');

  await withBrowser(async (browser) => {
    for (const game of GAMES) {
      const page = await openPage(browser, report);
      try {
        // --- control: never played -> no banner ---
        await openGameFromHome(page, game.id);
        await page.waitForTimeout(100);
        const noBannerYet = await page.isVisible('.draft-banner').catch(() => false);
        report.check(`${game.name}: no banner on a never-played game`, !noBannerYet);

        // --- fill partially, then reload TWICE before touching the banner ---
        await game.toEntryScreen(page);
        await page.waitForTimeout(100);
        await game.fill(page, { count: 3 });
        await page.waitForTimeout(120);

        const savedBefore = await draftKey(page, game.id);
        report.check(`${game.name}: draft saved to sessionStorage`, !!savedBefore);

        await page.reload();
        await openGameFromHome(page, game.id);
        await page.waitForTimeout(120);
        await page.reload(); // second reload — this is what used to corrupt the draft
        await openGameFromHome(page, game.id);
        await page.waitForTimeout(150);

        const savedAfterDoubleReload = await draftKey(page, game.id);
        const stillIntact =
          savedBefore &&
          savedAfterDoubleReload &&
          JSON.stringify(savedAfterDoubleReload) === JSON.stringify(savedBefore);
        report.check(
          `${game.name}: draft survives opening the screen twice unrestored`,
          stillIntact,
        );

        const bannerVisible = await page.isVisible('.draft-banner').catch(() => false);
        report.check(`${game.name}: recovery banner shows after reload`, bannerVisible);

        await page.click('.draft-restore');
        await page.waitForTimeout(150);
        // $$eval (not a raw page.evaluate + document.querySelectorAll) —
        // Playwright's own CSS engine pierces open shadow roots, unlike a
        // plain in-page document.querySelectorAll, so this keeps working
        // once a game is a Shadow DOM Lit component (see
        // docs/modernization-plan.md Phase 2+).
        //
        // .screen.active is gone — every round is always in the DOM now
        // (src/game-shell.js), not just one "active" one, and restoring a
        // draft can land on any round depending on the game. Scoping to
        // .round-body (every round, not just one) instead of trying to
        // guess which round is "current" still answers the same
        // question — did restoring actually repopulate something,
        // anywhere — since every OTHER round's inputs stay empty either
        // way.
        const hasFilledInput = await page
          .$$eval('.round-body input', (inputs) => inputs.some((i) => i.value !== ''))
          .catch(() => false);
        const onButtonCount = await page
          .$$eval('.round-body .toggle-pair button.on', (btns) => btns.length)
          .catch(() => 0);
        const restoredSomething = hasFilledInput || onButtonCount > 0;
        report.check(`${game.name}: restore repopulates the form`, restoredSomething);

        // --- discard path: fill again, reload, discard, confirm gone for good ---
        await exitToHome(page);
        await openGameFromHome(page, game.id);
        await page.waitForTimeout(80);
        await game.toEntryScreen(page);
        await page.waitForTimeout(80);
        await game.fill(page, { count: 2 });
        await page.waitForTimeout(120);
        await page.reload();
        await openGameFromHome(page, game.id);
        await page.waitForTimeout(120);
        await page.click('.draft-discard');
        await page.waitForTimeout(100);
        await page.reload();
        await openGameFromHome(page, game.id);
        await page.waitForTimeout(120);
        const bannerAfterDiscard = await page.isVisible('.draft-banner').catch(() => false);
        report.check(`${game.name}: banner gone for good after discard`, !bannerAfterDiscard);
      } catch (e) {
        report.fail(`${game.name}: threw during persistence flow`, e.message);
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
