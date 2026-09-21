// test/false-consensus.spec.js
// Ложный консенсус: the intro no longer has the "Задайте вопрос вслух"
// heading (the question itself stays), and collecting the answers has a
// 30-second visual timer whose length can be changed.

const { Report, openPage, withBrowser, openGameFromHome } = require('./lib');

async function run() {
  const report = new Report();
  report.section('Ложный консенсус — intro wording and the 30s entry timer');

  await withBrowser(async (browser) => {
    const page = await openPage(browser, report);
    try {
      await openGameFromHome(page, 'false-consensus');
      await page.waitForTimeout(150);
      const intro = (await page.textContent('#round-0')).replace(/\s+/g, ' ');
      report.check(
        'the "Задайте вопрос вслух" heading is gone',
        !intro.includes('Задайте вопрос вслух'),
      );
      report.check(
        'the question itself is still shown, with the yes/no instruction',
        (await page.textContent('#fc-question-text')).includes(
          'Каждый отвечает про себя: да или нет',
        ),
      );
      report.check(
        'the second step ("Каждый оценивает команду") is untouched',
        intro.includes('Каждый оценивает команду'),
      );

      const timer = '#round-1 .round-timer';
      report.check('the entry round has a timer card', (await page.$(timer)) !== null);
      report.check('it is the compact one-row widget', (await page.$(`${timer}.compact`)) !== null);
      const val = () => page.$eval(`${timer} .round-timer-input`, (el) => el.value);
      report.check('it starts at 0:30', (await val()) === '0:30');

      // It sits above the table, not below it.
      const order = await page.evaluate(() => {
        const deep = (r, s, o = []) => {
          r.querySelectorAll(s).forEach((e) => {
            o.push(e);
          });
          r.querySelectorAll('*').forEach((e) => {
            if (e.shadowRoot) deep(e.shadowRoot, s, o);
          });
          return o;
        };
        const t = deep(document, '#round-1 .round-timer')[0].getBoundingClientRect().top;
        const head = deep(document, '#round-1 .entry-head')[0].getBoundingClientRect().top;
        return t < head;
      });
      report.check(
        'the timer is above the answers table (start it, then enter the results)',
        order,
      );

      await page.click('button:has-text("Вносить данные")');
      await page.waitForTimeout(300);
      await page.click(`${timer} .round-timer-actions .ghost`);
      await page.waitForTimeout(2300);
      const running = (await page.textContent(`${timer} .round-timer-time`)).trim();
      report.check('it counts down from 0:30', /^0:2[5-8]$/.test(running), running);
      report.check(
        'the length is locked while it runs',
        (await page.$(`${timer} .timer-step`)) === null,
      );
      await page.click(`${timer} .round-timer-actions .ghost`); // "Сбросить"
      report.check('reset puts it back to 0:30', (await val()) === '0:30');

      await page.click(`${timer} button[aria-label="Увеличить время"]`);
      report.check('the length is adjustable (+5 s → 0:35)', (await val()) === '0:35');
      report.check(
        '"вернуть 0:30" appears',
        (await page.textContent(`${timer} .timer-default`)).includes('0:30'),
      );
      await page.click(`${timer} .timer-default`);
      report.check('and restores the default', (await val()) === '0:30');
    } catch (e) {
      report.fail('false-consensus: threw', e.message);
    }
    await page.close();
  });

  return report;
}

module.exports = { run };

if (require.main === module) {
  run().then((r) => process.exit(r.summary() ? 0 : 1));
}
