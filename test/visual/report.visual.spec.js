// test/visual/report.visual.spec.js
// Visual regression for the exported PNG report (src/report-export.js):
// for every game, drive it to the results screen with the same fixed data
// the other suites use, download the report, and compare it against the
// committed baseline. Catches what functional tests can't — a broken layout,
// a lost chart, an icon that stopped rendering, a colour that drifted.
//
// The report is a file (a Buffer), not a page, so the comparison is
// expect(buffer).toMatchSnapshot(): the same image comparator as
// toHaveScreenshot(). It is downscaled to 720px wide first: the full 2×
// export is ~2000px wide and would put ~20 MB of baselines in git, while a
// layout regression is just as visible at a third of the size.
//
// Everything that varies between runs is pinned: the date printed on the
// report, Math.random (role/pair shuffles), viewport and motion.
const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const sharp = require('sharp');
const { DIST_URL, openGameFromHome } = require('../lib');
const { GAMES } = require('../games');

const FIXED_DATE = new Date('2026-01-15T10:00:00');
const COMPARE_WIDTH = 720;

// mulberry32 — a tiny seeded PRNG replacing Math.random in the page.
const seedRandom = () => {
  let a = 0x2f6e2b1;
  Math.random = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

for (const game of GAMES) {
  test(`${game.name}: exported PNG report looks the same`, async ({ page }) => {
    await page.clock.setFixedTime(FIXED_DATE);
    await page.addInitScript(seedRandom);
    await page.goto(DIST_URL);

    await openGameFromHome(page, game.id);
    await page.waitForTimeout(100);
    await game.toEntryScreen(page);
    await page.waitForTimeout(100);
    await game.fill(page, {});
    await game.toResults(page);
    await page.waitForTimeout(900); // let chart pop-in transitions settle

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export-btn'),
    ]);
    const png = fs.readFileSync(await download.path());
    const small = await sharp(png).resize({ width: COMPARE_WIDTH }).png().toBuffer();

    expect(small).toMatchSnapshot(`${game.id}.png`);
  });
}
