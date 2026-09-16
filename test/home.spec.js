// test/home.spec.js
// Everything that lives on the home screen and isn't tied to a specific
// game: category filter, participant-structure filter (combined), the
// participants HUD panel (add/remove + avatar cycling), selecting a
// location (hover name reveal + click opens the agenda panel without
// navigating away), and the random-game button respecting whatever
// filters are active.
//
// Since the gamified map redesign (branch `gme`), filtering HIGHLIGHTS
// non-matching locations instead of hiding them, and a location is
// just its icon — no card, no permanently-visible name — see
// docs/modernization-plan.md's "Гейм-карта" entry. So these checks
// count `.location[data-match="true"]` rather than `.game-card`, read
// each location's name off `.loc-name-tip` (hover-revealed, not
// `.loc-label`, which no longer exists), and the "empty intersection"
// case checks that EVERY location is dimmed (plus the empty-state note
// appears) instead of checking for zero cards.

const { Report, openPage, withBrowser, exitToHome } = require('./lib');

async function run() {
  const report = new Report();
  report.section('Home screen');

  await withBrowser(async (browser) => {
    const page = await openPage(browser, report);

    // --- category filter ---
    await page.click('text=Социальная психология');
    await page.waitForTimeout(80);
    let matched = await page.$$eval('.location[data-match="true"] .loc-name-tip', (els) =>
      els.map((e) => e.textContent),
    );
    report.check(
      'category filter "Социальная психология" -> exactly 2 locations lit up',
      matched.length === 2,
      JSON.stringify(matched),
    );
    const dimmedCount = await page.$$eval('.location[data-match="false"]', (els) => els.length);
    report.check(
      'the other 11 locations are dimmed, not removed from the DOM',
      dimmedCount === 11,
      dimmedCount,
    );

    // --- combine with structure filter -> empty intersection dims everything + shows a note ---
    await page.click('text=Все'); // reset category
    await page.waitForTimeout(60);
    await page.click('text=Когнитивные искажения');
    await page.click('text=По парам');
    await page.waitForTimeout(80);
    const allDimmed = await page.$$eval('.location', (els) =>
      els.every((e) => e.getAttribute('data-match') === 'false'),
    );
    const emptyNoteVisible = await page.isVisible('.empty-note').catch(() => false);
    report.check(
      'empty filter intersection dims every location and shows a note',
      allDimmed && emptyNoteVisible,
    );

    // --- structure filter alone ---
    await page.click('text=Все'); // reset category again
    await page.waitForTimeout(60);
    matched = await page.$$eval('.location[data-match="true"] .loc-name-tip', (els) =>
      els.map((e) => e.textContent),
    );
    report.check(
      'structure filter "По парам" alone -> exactly 2 locations lit up',
      matched.length === 2,
      JSON.stringify(matched),
    );
    await page.click('text=Все'); // reset structure filter back to all
    await page.waitForTimeout(80);

    // --- hover: name reveals (opacity, not a native tooltip), no navigation ---
    const target = '[data-game-id="anchoring"]';
    const opacityBefore = await page.$eval(
      `${target} .loc-name-tip`,
      (el) => getComputedStyle(el).opacity,
    );
    await page.hover(target);
    await page.waitForTimeout(200);
    const opacityHovered = await page.$eval(
      `${target} .loc-name-tip`,
      (el) => getComputedStyle(el).opacity,
    );
    report.check(
      'hovering a location reveals its name (opacity 0 -> 1)',
      opacityBefore === '0' && opacityHovered === '1',
      `${opacityBefore} -> ${opacityHovered}`,
    );
    const stillHome = await page.textContent('h1');
    report.check(
      'hovering a location keeps us on the home screen',
      stillHome.includes('5 минут общего развития'),
    );

    // --- click: selects/focuses (agenda panel opens), does NOT navigate ---
    await page.click(target);
    await page.waitForTimeout(300);
    const agendaTitle = await page.textContent('.agenda-panel h3').catch(() => null);
    report.check(
      'clicking a location opens the agenda panel with its name',
      agendaTitle?.trim() === 'Эффект якоря',
      agendaTitle,
    );
    const stillHomeAfterClick = await page.textContent('h1').catch(() => '');
    report.check(
      'clicking a location keeps us on the home screen (start is a separate step)',
      stillHomeAfterClick.includes('5 минут общего развития'),
    );
    const selectedClass = await page.getAttribute(target, 'class');
    report.check(
      'the clicked location gets the .selected class',
      selectedClass.includes('selected'),
    );

    // --- close the agenda panel: flies back, clears selection ---
    await page.click('.agenda-close');
    await page.waitForTimeout(300);
    const panelGone = await page.isVisible('.agenda-panel').catch(() => false);
    report.check('closing the agenda panel removes it', !panelGone);
    const stillSelected = await page.getAttribute(target, 'class');
    report.check(
      'closing the agenda panel clears the selection',
      !stillSelected.includes('selected'),
    );

    // --- participants: expand the (collapsed-by-default) roster, add, avatar renders, count updates ---
    await page.click('.roster-toggle');
    await page.waitForTimeout(80);
    const countBefore = await page.textContent('.panel-head .count');
    await page.fill('#new-participant', 'Богдан');
    await page.click('#add-participant-btn');
    await page.waitForTimeout(80);
    const countAfter = await page.textContent('.panel-head .count');
    report.check(
      'adding a participant increments the count',
      countBefore !== countAfter,
      `${countBefore} -> ${countAfter}`,
    );
    const newAvatarExists = await page.isVisible('.chip:has-text("Богдан") .avatar');
    report.check('new participant gets an avatar', newAvatarExists);

    // --- remove participant ---
    await page.click('.chip:has-text("Богдан") .chip-x');
    await page.waitForTimeout(80);
    const countRestored = await page.textContent('.panel-head .count');
    report.check(
      'removing a participant decrements the count back',
      countRestored === countBefore,
      `${countRestored} vs ${countBefore}`,
    );

    // --- random game respects the active category filter ---
    // "Случайная игра" now flies to the pick, holds ~3s, then dives in
    // and starts it (map-render.js's focusAndAutoStart) — a deliberate
    // pause, not an animation-speed thing, so it can't be skipped even
    // under reducedMotion. Fewer trials than a plain instant-pick would
    // warrant, to keep this suite's runtime sane.
    await page.click('text=Экономика / теория игр');
    await page.waitForTimeout(80);
    const econNames = new Set(
      await page.$$eval('.location[data-match="true"] .loc-name-tip', (els) =>
        els.map((e) => e.textContent),
      ),
    );
    const seen = new Set();
    for (let i = 0; i < 4; i++) {
      await page.click('#random-game-btn');
      await page.waitForTimeout(3400);
      // .crumb-current is gone — the game's name now sits in
      // .game-rail-title next to the map (src/game-shell.js).
      const title = await page.textContent('.game-rail-title').catch(() => null);
      if (title) seen.add(title.trim());
      await exitToHome(page);
      await page.click('text=Экономика / теория игр');
      await page.waitForTimeout(60);
    }
    const allWithinCategory = [...seen].every((n) => econNames.has(n));
    report.check(
      'random game only picks from the active category filter',
      allWithinCategory,
      `seen=${[...seen]} allowed=${[...econNames]}`,
    );

    await page.close();
  });

  return report;
}

module.exports = { run };

if (require.main === module) {
  run().then((r) => process.exit(r.summary() ? 0 : 1));
}
