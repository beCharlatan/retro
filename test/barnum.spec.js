// test/barnum.spec.js
// Эффект Барнума is staged as a two-day experiment: the day BEFORE, the
// facilitator asks each person three innocuous open-ended questions "to
// prepare a personal portrait"; on the day, everyone gets the same generic
// text as "their" portrait. Locks in: both texts are hidden-by-default,
// copyable spoilers; the three questions are veiled and open; the results
// show the questions and the portrait separately; the old "Сюрприз" reveal
// is gone.

const { Report, openPage, withBrowser, openGameFromHome, enableTestHooks } = require('./lib');
const { GAMES } = require('./games');

async function run() {
  const report = new Report();
  report.section('Эффект Барнума — questions the day before, portrait on the day');

  await withBrowser(async (browser) => {
    const ctx = await browser.newContext({
      viewport: { width: 1000, height: 1300 },
      reducedMotion: 'reduce',
    });
    await enableTestHooks(ctx);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    try {
      await page.goto(`file://${require('node:path').join(__dirname, '..', 'dist', 'index.html')}`);
      await openGameFromHome(page, 'barnum');
      await page.waitForTimeout(150);

      const hidden = (key) => page.getAttribute(`#text-${key}`, 'hidden');
      report.check(
        'the portrait text ("Текст для команды") is hidden by default',
        (await hidden('profile')) !== null,
      );
      report.check(
        'the three questions are hidden by default too',
        (await hidden('questions')) !== null,
      );
      const visibleText = (await page.textContent('#round-0')).replace(/\s+/g, ' ');
      const profileVisible = await page.isVisible('#text-profile');
      report.check('the portrait text is not visible on the intro screen', !profileVisible);
      report.check(
        'the intro tells the facilitator to ask the questions the day before',
        visibleText.includes('Накануне: задайте каждому три вопроса'),
      );
      report.check(
        '...and to hand out the "personal" portrait on the day',
        visibleText.includes('В день игры'),
      );

      // Reveal / hide the two independently.
      await page.click('#toggle-questions');
      report.check(
        'showing the questions does not show the portrait',
        (await hidden('questions')) === null && (await hidden('profile')) !== null,
      );
      const items = await page.$$eval('#text-questions .question-list-item', (els) =>
        els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
      );
      report.check(
        'there are exactly three questions',
        items.length === 3,
        `count=${items.length}`,
      );
      report.check(
        'the questions are open-ended, not yes/no or a rating scale',
        items.every(
          (q) =>
            /Опишите|Вспомните|Представьте|Расскажите/.test(q) &&
            !/\b(да или нет|по шкале|оцените)\b/i.test(q),
        ),
      );
      report.check(
        'the questions do not mention personality, psychology or a test (they are veiled)',
        items.every((q) => !/(личност|психолог|тест|характер|опросник)/i.test(q)),
      );
      await page.click('#toggle-profile');
      report.check('showing the portrait works', (await hidden('profile')) === null);
      await page.click('#toggle-profile');
      report.check('and it can be hidden again', (await hidden('profile')) !== null);

      // Copy buttons.
      const clip = async (id) => {
        await page.click(id);
        await page.waitForTimeout(120);
        return page.evaluate(() => navigator.clipboard.readText());
      };
      const q = await clip('#copy-questions');
      report.check(
        'copy questions: gives a numbered message with all three',
        q.includes('1. ') && q.includes('2. ') && q.includes('3. ') && q.includes('Для подготовки'),
        q.slice(0, 60),
      );
      report.check(
        'copy questions: contains the same text as shown',
        items.every((it) => q.includes(it.replace(/^\d\s*/, '').slice(0, 30))),
      );
      const p = await clip('#copy-profile');
      report.check(
        'copy portrait: gives the portrait text',
        p.startsWith('Иногда вы сомневаетесь'),
        p.slice(0, 40),
      );

      // Through to the results.
      const game = GAMES.find((g) => g.id === 'barnum');
      await game.toEntryScreen(page);
      await game.fill(page, {});
      await game.toResults(page);
      await page.waitForTimeout(600);

      const results = (await page.textContent('#round-2')).replace(/\s+/g, ' ');
      report.check(
        'the "Сюрприз" reveal is gone from the results',
        !results.includes('Сюрприз') &&
          !results.includes('Никакого «индивидуального анализа» не было'),
      );
      const recap = await page.$$eval('#questions-recap .question-list-item', (els) =>
        els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
      );
      report.check(
        'the results show the same three questions',
        recap.length === 3 && recap.every((r, i) => r === items[i]),
        recap.join(' | ').slice(0, 80),
      );
      report.check(
        'the questions block is separate from the portrait block',
        (await page.$('#questions-recap #profile-recap')) === null &&
          (await page.$('#profile-recap')) !== null,
      );
      report.check(
        'the portrait text is printed in its own block',
        (await page.textContent('#profile-recap')).includes('Иногда вы сомневаетесь'),
      );
      const titles = await page.$$eval('#round-2 .scenario-result-title', (els) =>
        els.map((e) => e.textContent.trim()),
      );
      report.check(
        'both blocks have their own headings',
        titles.length === 2 && titles[0].includes('вопроса') && titles[1].includes('портрет'),
        titles.join(' | '),
      );
      const data = await page.evaluate(() => window.__reportData);
      report.check(
        'the export mentions the three questions',
        !!data && data.meta.extra.includes('3 вопроса'),
        JSON.stringify(data?.meta),
      );
    } catch (e) {
      report.fail('barnum: threw', e.message);
    }
    if (errors.length) report.fail('barnum: no page errors', errors.join('; '));
    await ctx.close();
  });

  return report;
}

module.exports = { run };

if (require.main === module) {
  run().then((r) => process.exit(r.summary() ? 0 : 1));
}
