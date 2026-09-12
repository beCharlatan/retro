// test/privacy.spec.js
// If the facilitator projects/shares their screen while collecting
// answers, participants shouldn't be able to read each other's
// numbers or choices as they're typed in — that would break the
// "independent judgment" premise several games rely on (anchoring,
// crowd-wisdom, calibration...) and could leak a custom quiz answer
// before people guess. Two CSS-driven mechanisms cover this:
//
//   - number inputs blur once they have a value AND lose focus —
//     only the field currently being edited is legible;
//   - toggle-pair buttons (Да/Нет, C/D, Программа 1/2...) blur their
//     "on" state a beat after being clicked, via a `.just-set` class
//     added by a delegated listener and removed after ~1.4s.
//
// Results tables are untouched by design (that's the actual reveal
// moment) since they don't contain <input> or .toggle-pair elements.

const { Report, openPage, withBrowser } = require('./lib');

function isBlurred(filterValue) {
  return filterValue !== 'none' && !/blur\(0(px)?\)/.test(filterValue);
}

async function run() {
  const report = new Report();
  report.section('Shared-screen privacy masking');

  await withBrowser(async (browser) => {
    // --- number inputs: anchoring (two fields per row) ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Эффект якоря');
      await page.click('text=Вносить данные →');
      await page.waitForTimeout(100);
      const inputs = await page.$$('[data-testid="entry-body"] input');

      const emptyFilter = await inputs[0].evaluate((el) => getComputedStyle(el).filter);
      report.check('anchoring: empty field is not blurred', !isBlurred(emptyFilter), emptyFilter);

      await inputs[0].fill('42');
      await page.waitForTimeout(200);
      const focusedFilter = await inputs[0].evaluate((el) => getComputedStyle(el).filter);
      report.check(
        'anchoring: the field currently being typed into is not blurred',
        !isBlurred(focusedFilter),
        focusedFilter,
      );

      await inputs[1].fill('55');
      await page.waitForTimeout(200);
      const lostFocusFilter = await inputs[0].evaluate((el) => getComputedStyle(el).filter);
      report.check(
        'anchoring: a filled field blurs once focus moves elsewhere',
        isBlurred(lostFocusFilter),
        lostFocusFilter,
      );

      const nowFocusedFilter = await inputs[1].evaluate((el) => getComputedStyle(el).filter);
      report.check(
        'anchoring: the newly-focused field is legible',
        !isBlurred(nowFocusedFilter),
        nowFocusedFilter,
      );

      await inputs[0].click();
      await page.waitForTimeout(200);
      const refocusedFilter = await inputs[0].evaluate((el) => getComputedStyle(el).filter);
      report.check(
        'anchoring: re-focusing a blurred field reveals it again',
        !isBlurred(refocusedFilter),
        refocusedFilter,
      );

      await page.close();
    }

    // --- number inputs: draft-restored values are blurred too ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Эффект якоря');
      await page.click('text=Вносить данные →');
      const inputs = await page.$$('[data-testid="entry-body"] input');
      await inputs[0].fill('42');
      await inputs[1].fill('30');
      await page.waitForTimeout(150);
      await page.reload();
      await page.click('text=Эффект якоря');
      await page.waitForTimeout(150);
      await page.click('.draft-restore');
      await page.waitForTimeout(250);
      const restoredInputs = await page.$$('[data-testid="entry-body"] input');
      const restoredFilter = await restoredInputs[0].evaluate((el) => getComputedStyle(el).filter);
      report.check(
        'anchoring: a restored (unfocused) draft value is blurred, not shown in the clear',
        isBlurred(restoredFilter),
        restoredFilter,
      );
      await page.close();
    }

    // --- toggle buttons: false-consensus ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Ложный консенсус');
      await page.click('text=Вносить данные →');
      await page.waitForTimeout(100);
      const rows = await page.$$('#entry-body .entry-row');
      const yesBtn = await rows[0].$('button[data-val="yes"]');

      await yesBtn.click();
      await page.waitForTimeout(150);
      const justClickedFilter = await yesBtn.evaluate((el) => getComputedStyle(el).filter);
      report.check(
        'false-consensus: choice is briefly visible right after clicking',
        !isBlurred(justClickedFilter),
        justClickedFilter,
      );

      await page.waitForTimeout(1500);
      const afterDelayFilter = await yesBtn.evaluate((el) => getComputedStyle(el).filter);
      report.check(
        'false-consensus: choice blurs again ~1.4s after the click',
        isBlurred(afterDelayFilter),
        afterDelayFilter,
      );

      const stillOn = await yesBtn.evaluate((el) => el.classList.contains('on'));
      report.check(
        'false-consensus: the underlying choice is still recorded while blurred',
        stillOn,
      );

      await page.close();
    }

    // --- toggle buttons: prisoners-dilemma (a second game using .toggle-pair) ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Дилемма заключённого');
      await page.click('text=Распределить пары →');
      await page.waitForTimeout(100);
      await page.click('text=Дальше →');
      await page.waitForTimeout(100);
      const card = await page.$('.pair-entry-card');
      const coopBtn = await card.$('button[data-val="C"]');
      await coopBtn.click();
      await page.waitForTimeout(1600);
      const filter = await coopBtn.evaluate((el) => getComputedStyle(el).filter);
      report.check(
        'prisoners-dilemma: toggle masking also applies here (shared CSS/listener)',
        isBlurred(filter),
        filter,
      );
      await page.close();
    }

    // --- results tables are never blurred (that's the actual reveal) ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Эффект якоря');
      await page.click('text=Вносить данные →');
      const inputs = await page.$$('[data-testid="entry-body"] input');
      for (let i = 0; i < inputs.length; i += 2) {
        await inputs[i].fill('20');
        await inputs[i + 1].fill('30');
      }
      await page.click('text=Показать результаты →');
      await page.waitForTimeout(200);
      const hasInputsInTable = await page.$$eval('#results-table input', (els) => els.length);
      report.check(
        'anchoring: results table has no <input> elements to blur (plain text reveal)',
        hasInputsInTable === 0,
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
