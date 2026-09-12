// test/copy.spec.js
// Two things worth locking in: the framing game's two scenario texts
// must stay hidden by default and toggle independently (so a shared
// screen never leaks one group's wording to the other), and the
// clipboard-copy buttons (framing's two + barnum's one) must put the
// right plain text on the clipboard — including copying WITHOUT first
// revealing, which is the whole point of sending it privately.

const { Report, withBrowser, DIST_URL } = require('./lib');

async function run() {
  const report = new Report();
  report.section('Spoiler + copy-to-clipboard (framing & barnum)');

  await withBrowser(async (browser) => {
    const context = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write'],
    });

    // --- framing ---
    {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(DIST_URL);
      await page.click('text=Эффект фрейминга');
      await page.click('text=Распределить группы →');
      await page.waitForTimeout(100);
      await page.click('text=Дальше →');
      await page.waitForTimeout(120);

      const aHidden = await page.getAttribute('#text-a', 'hidden');
      const bHidden = await page.getAttribute('#text-b', 'hidden');
      report.check(
        'framing: both group texts hidden by default',
        aHidden !== null && bHidden !== null,
      );

      // copy group B WITHOUT revealing it first — the private-send workflow
      await page.click('#copy-b');
      await page.waitForTimeout(120);
      const clipB = await page.evaluate(() => navigator.clipboard.readText());
      report.check(
        'framing: copying group B works without revealing it',
        clipB.includes('400 человек'),
        clipB.slice(0, 40),
      );
      const bStillHidden = await page.getAttribute('#text-b', 'hidden');
      report.check('framing: group B stays hidden after copying it', bStillHidden !== null);

      // reveal group A only, confirm B is unaffected (independent toggles)
      await page.click('#toggle-a');
      await page.waitForTimeout(100);
      const aVisible = await page.getAttribute('#text-a', 'hidden');
      const bUnaffected = await page.getAttribute('#text-b', 'hidden');
      report.check(
        'framing: revealing group A does not reveal group B',
        aVisible === null && bUnaffected !== null,
      );

      const clipA = await (async () => {
        await page.click('#copy-a');
        await page.waitForTimeout(120);
        return page.evaluate(() => navigator.clipboard.readText());
      })();
      report.check(
        'framing: group A clipboard content matches group A wording',
        clipA.includes('200 человек') && !clipA.includes('400 человек'),
        clipA.slice(0, 40),
      );

      if (errors.length) report.fail('framing: no console errors', errors.join('; '));
      await page.close();
    }

    // --- barnum ---
    {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto(DIST_URL);
      await page.click('text=Эффект Барнума');
      await page.waitForTimeout(120);

      const btnVisible = await page.isVisible('#copy-profile').catch(() => false);
      report.check('barnum: copy button visible on instructions screen', btnVisible);

      await page.click('#copy-profile');
      await page.waitForTimeout(120);
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      report.check(
        'barnum: clipboard matches the profile text shown on screen',
        clip.startsWith('Иногда вы сомневаетесь'),
        clip.slice(0, 40),
      );

      if (errors.length) report.fail('barnum: no console errors', errors.join('; '));
      await page.close();
    }
  });

  return report;
}

module.exports = { run };

if (require.main === module) {
  run().then((r) => process.exit(r.summary() ? 0 : 1));
}
