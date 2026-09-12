// test/home.spec.js
// Everything that lives on the home screen and isn't tied to a specific
// game: category filter, participant-structure filter (combined), the
// participants panel (add/remove + avatar cycling), the teaser
// collapse toggle not triggering navigation, and the random-game button
// respecting whatever filters are active.

const { Report, openPage, withBrowser } = require('./lib');

async function run() {
  const report = new Report();
  report.section('Home screen');

  await withBrowser(async (browser) => {
    const page = await openPage(browser, report);

    // --- category filter ---
    await page.click('text=Социальная психология');
    await page.waitForTimeout(80);
    let names = await page.$$eval('.game-card .name', els => els.map(e => e.textContent));
    report.check('category filter "Социальная психология" -> exactly 2 games',
      names.length === 2, JSON.stringify(names));

    // --- combine with structure filter -> empty intersection shows a message, not a crash ---
    await page.click('text=Все'); // reset category
    await page.waitForTimeout(60);
    await page.click('text=Когнитивные искажения');
    await page.click('text=По парам');
    await page.waitForTimeout(80);
    const emptyMsg = await page.isVisible('.note').catch(() => false);
    const emptyCards = await page.$$('.game-card');
    report.check('empty filter intersection shows a message and no cards',
      emptyMsg && emptyCards.length === 0);

    // --- structure filter alone ---
    await page.click('text=Все'); // reset category again
    await page.waitForTimeout(60);
    names = await page.$$eval('.game-card .name', els => els.map(e => e.textContent));
    report.check('structure filter "По парам" alone -> exactly 2 games',
      names.length === 2, JSON.stringify(names));
    await page.click('text=Все'); // reset structure filter back to all
    await page.waitForTimeout(80);

    // --- teaser collapse: click doesn't navigate away ---
    await page.click('.game-card >> nth=0 >> .teaser-toggle');
    await page.waitForTimeout(80);
    const stillHome = await page.textContent('h1');
    report.check('clicking "Что это?" keeps us on the home screen',
      stillHome.includes('5 минут общего развития'));
    const teaserNowVisible = await page.isVisible('.game-card >> nth=0 >> .teaser');
    report.check('teaser expands after clicking the toggle', teaserNowVisible);

    // --- participants: add, avatar renders, count updates ---
    const countBefore = await page.textContent('.panel-head .count');
    await page.fill('#new-participant', 'Богдан');
    await page.click('#add-participant-btn');
    await page.waitForTimeout(80);
    const countAfter = await page.textContent('.panel-head .count');
    report.check('adding a participant increments the count',
      countBefore !== countAfter, `${countBefore} -> ${countAfter}`);
    const newAvatarExists = await page.isVisible('.chip:has-text("Богдан") .avatar');
    report.check('new participant gets an avatar', newAvatarExists);

    // --- remove participant ---
    await page.click('.chip:has-text("Богдан") .chip-x');
    await page.waitForTimeout(80);
    const countRestored = await page.textContent('.panel-head .count');
    report.check('removing a participant decrements the count back',
      countRestored === countBefore, `${countRestored} vs ${countBefore}`);

    // --- random game respects the active category filter ---
    await page.click('text=Экономика / теория игр');
    await page.waitForTimeout(80);
    const econNames = new Set(await page.$$eval('.game-card .name', els => els.map(e => e.textContent)));
    const seen = new Set();
    for (let i = 0; i < 10; i++) {
      await page.click('#random-game-btn');
      await page.waitForTimeout(100);
      const title = (await page.textContent('.crumb-current').catch(() => null));
      if (title) seen.add(title.trim());
      await page.click('text=← Все игры');
      await page.waitForTimeout(80);
      await page.click('text=Экономика / теория игр');
      await page.waitForTimeout(60);
    }
    const allWithinCategory = [...seen].every(n => econNames.has(n));
    report.check('random game only picks from the active category filter',
      allWithinCategory, `seen=${[...seen]} allowed=${[...econNames]}`);

    await page.close();
  });

  return report;
}

module.exports = { run };

if (require.main === module) {
  run().then(r => process.exit(r.summary() ? 0 : 1));
}
