// test/timer.spec.js
// The answer-timer widget is configurable per timer: − / + steps and a
// typeable m:ss field while idle, a "вернуть 0:20" link back to the
// default, and — in availability.js, which has one timer per question —
// each question's length is independent of the others.

const { Report, openPage, withBrowser, openGameFromHome } = require('./lib');

const valueOf_ = (page, selector) => page.$eval(`${selector} .round-timer-input`, (el) => el.value);

async function run() {
  const report = new Report();
  report.section('Answer timer — per-timer duration');

  await withBrowser(async (browser) => {
    // --- availability: several timers, each with its own length ---
    {
      const page = await openPage(browser, report);
      try {
        await openGameFromHome(page, 'availability');
        await page.click('button:has-text("Начать вопросы")');
        await page.waitForTimeout(150);
        const q1 = '#round-1';

        report.check(
          'availability: Q1 timer starts at the default 0:20',
          (await valueOf_(page, q1)) === '0:20',
        );
        report.check(
          'availability: no "вернуть" link while at the default',
          (await page.$(`${q1} .timer-default`)) === null,
        );

        await page.click(`${q1} button[aria-label="Увеличить время"]`);
        report.check('availability: "+" adds 5 s (0:25)', (await valueOf_(page, q1)) === '0:25');
        await page.click(`${q1} button[aria-label="Уменьшить время"]`);
        await page.click(`${q1} button[aria-label="Уменьшить время"]`);
        report.check(
          'availability: "−" subtracts 5 s (0:15)',
          (await valueOf_(page, q1)) === '0:15',
        );
        report.check(
          'availability: a "вернуть 0:20" link appears once it differs from the default',
          (await page.textContent(`${q1} .timer-default`)).includes('0:20'),
        );

        await page.fill(`${q1} .round-timer-input`, '1:30');
        await page.press(`${q1} .round-timer-input`, 'Enter');
        report.check('availability: typing 1:30 sets 1:30', (await valueOf_(page, q1)) === '1:30');

        await page.fill(`${q1} .round-timer-input`, '45');
        await page.press(`${q1} .round-timer-input`, 'Enter');
        report.check(
          'availability: typing plain seconds ("45") works',
          (await valueOf_(page, q1)) === '0:45',
        );

        await page.fill(`${q1} .round-timer-input`, 'абв');
        await page.press(`${q1} .round-timer-input`, 'Enter');
        report.check(
          'availability: garbage is rejected, the old value stays',
          (await valueOf_(page, q1)) === '0:45',
        );

        // Independence: fill Q1 enough to move on, then look at Q2.
        const rows = await page.$$('#entry-body-0 .entry-row');
        for (let i = 0; i < 2; i++) await (await rows[i].$('button[data-val="a"]')).click();
        await page.click('#next-btn-0');
        await page.waitForTimeout(500);
        const q2 = '#round-2';
        report.check(
          'availability: Q2 still has the default length (Q1’s change did not leak)',
          (await valueOf_(page, q2)) === '0:20',
        );
        await page.click(`${q2} button[aria-label="Увеличить время"]`);
        await page.click(`${q2} button[aria-label="Увеличить время"]`);
        await page.click(`${q2} button[aria-label="Увеличить время"]`);
        report.check(
          'availability: Q2 can be changed on its own (0:35)',
          (await valueOf_(page, q2)) === '0:35',
        );
        report.check(
          'availability: Q1 kept its own length (0:45)',
          (await valueOf_(page, q1)) === '0:45',
        );

        // Starting: counts down from THIS question's length, and hides the editor.
        await page.click(`${q2} .round-timer-actions .ghost`);
        await page.waitForTimeout(1300);
        const shown = await page.textContent(`${q2} .round-timer-time`);
        report.check(
          'availability: started Q2 counts down from 0:35',
          /^0:3[3-4]$/.test(shown.trim()),
          shown.trim(),
        );
        report.check(
          'availability: the length can’t be edited while the clock runs',
          (await page.$(`${q2} .timer-step`)) === null,
        );
        report.check(
          'availability: Q1’s idle card still shows its own 0:45 while Q2 runs',
          (await valueOf_(page, q1)) === '0:45',
        );

        // Reset → back to idle and editable, at the length that was set.
        await page.click(`${q2} .round-timer-actions .ghost`); // "Сбросить"
        await page.waitForTimeout(150);
        report.check(
          'availability: reset returns to idle at 0:35',
          (await valueOf_(page, q2)) === '0:35',
        );
      } catch (e) {
        report.fail('availability: threw during timer flow', e.message);
      } finally {
        await page.close();
      }
    }

    // --- availability: "вернуть" and the limits ---
    {
      const page = await openPage(browser, report);
      try {
        await openGameFromHome(page, 'availability');
        await page.click('button:has-text("Начать вопросы")');
        await page.waitForTimeout(150);
        const q1 = '#round-1';
        await page.fill(`${q1} .round-timer-input`, '2:00');
        await page.press(`${q1} .round-timer-input`, 'Enter');
        await page.click(`${q1} .timer-default`);
        report.check(
          'availability: "вернуть 0:20" restores the default',
          (await valueOf_(page, q1)) === '0:20',
        );

        await page.fill(`${q1} .round-timer-input`, '1');
        await page.press(`${q1} .round-timer-input`, 'Enter');
        report.check(
          'availability: absurdly short input is raised to the 0:05 minimum',
          (await valueOf_(page, q1)) === '0:05',
        );
        report.check(
          'availability: "−" is disabled at the minimum',
          await page.$eval(`${q1} button[aria-label="Уменьшить время"]`, (b) => b.disabled),
        );
      } catch (e) {
        report.fail('availability: threw during limits flow', e.message);
      } finally {
        await page.close();
      }
    }

    // --- framing: the single 2:00 timer is configurable too ---
    {
      const page = await openPage(browser, report);
      try {
        await openGameFromHome(page, 'framing');
        await page.click('button:has-text("Распределить группы")');
        await page.waitForTimeout(80);
        await page.click('button:has-text("Дальше")'); // groups → the texts round with the timer
        await page.waitForTimeout(600);
        const timer = '.round-timer';
        report.check(
          'framing: timer starts at the default 2:00',
          (await valueOf_(page, timer)) === '2:00',
        );
        await page.click(`${timer} button[aria-label="Увеличить время"]`);
        await page.click(`${timer} button[aria-label="Увеличить время"]`);
        report.check(
          'framing: two "+" presses add 2 × 15 s (2:30)',
          (await valueOf_(page, timer)) === '2:30',
        );
        report.check(
          'framing: "вернуть 2:00" is offered',
          (await page.textContent(`${timer} .timer-default`)).includes('2:00'),
        );
        await page.click(`${timer} .timer-default`);
        report.check('framing: "вернуть" restores 2:00', (await valueOf_(page, timer)) === '2:00');
      } catch (e) {
        report.fail('framing: threw during timer flow', e.message);
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
