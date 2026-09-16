// test/export.spec.js
// Every game's results screen can be exported as a branded PNG report
// (src/report-export.js): clicking the export button must download a
// real PNG named "Game_Name_DD.MM.YYYY.png", at report width, and the
// results screen registers what the report will say (subtitle, meta,
// explanation). Also guards that the old print-only markup is gone.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Report, openPage, withBrowser, openGameFromHome } = require('./lib');
const { GAMES } = require('./games');

const REPORT_WIDTH_PX = 1080;
const PIXEL_RATIO = 2;

// PNG IHDR: 8-byte signature, then length+type (8), then width, height (big-endian u32).
function readPngSize(buf) {
  const signature = buf.subarray(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

async function run() {
  const report = new Report();
  report.section('PNG export — branded report for every results screen');

  await withBrowser(async (browser) => {
    for (const game of GAMES) {
      const page = await openPage(browser, report);
      try {
        await openGameFromHome(page, game.id);
        await page.waitForTimeout(100);
        await game.toEntryScreen(page);
        await page.waitForTimeout(100);
        await game.fill(page, {});
        await game.toResults(page);
        await page.waitForTimeout(300);

        const registered = await page.evaluate(() => window.__reportData || null);
        report.check(
          `${game.name}: results screen registers the report data`,
          !!registered &&
            registered.gameId === game.id &&
            registered.subtitle.length > 10 &&
            registered.explanation.length > 80 &&
            registered.meta.count > 0,
          JSON.stringify(registered)?.slice(0, 120),
        );

        const exportBtnVisible = await page.isVisible('#export-btn').catch(() => false);
        report.check(`${game.name}: export button visible`, exportBtnVisible);

        const legacyPrintMarkup = await page
          .$$eval('.print-header, .print-footer, #pdf-btn', (els) => els.length)
          .catch(() => 0);
        report.check(`${game.name}: no leftover print-only markup`, legacyPrintMarkup === 0);

        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 20000 }),
          page.click('#export-btn'),
        ]);

        const today = new Date();
        const expectedDate = [
          String(today.getDate()).padStart(2, '0'),
          String(today.getMonth() + 1).padStart(2, '0'),
          today.getFullYear(),
        ].join('.');
        const expectedName = `${game.name.replace(/\s+/g, '_')}_${expectedDate}.png`;
        report.check(
          `${game.name}: file is named after the game + today's date`,
          download.suggestedFilename() === expectedName,
          download.suggestedFilename(),
        );

        const tmp = path.join(os.tmpdir(), `retro-export-${game.id}-${Date.now()}.png`);
        await download.saveAs(tmp);
        const buf = fs.readFileSync(tmp);
        fs.unlinkSync(tmp);
        const size = readPngSize(buf);
        report.check(`${game.name}: downloaded file is a real PNG`, !!size, `bytes=${buf.length}`);
        report.check(
          `${game.name}: PNG has the report width`,
          size?.width === REPORT_WIDTH_PX * PIXEL_RATIO,
          `width=${size?.width}`,
        );
        report.check(
          `${game.name}: PNG holds real content (not a blank sheet)`,
          buf.length > 40000 && size?.height > 1500 * PIXEL_RATIO * 0.6,
          `bytes=${buf.length}, height=${size?.height}`,
        );

        // The off-screen staging node must be cleaned up afterwards, and
        // the button usable again.
        await page.waitForTimeout(100);
        const leftovers = await page.$$eval('.rx-stage', (els) => els.length);
        report.check(`${game.name}: staging node removed after export`, leftovers === 0);
        const stillDisabled = await page.$eval('#export-btn', (b) => b.disabled);
        report.check(`${game.name}: export button re-enabled after export`, !stillDisabled);
      } catch (e) {
        report.fail(`${game.name}: threw during export flow`, e.message);
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
