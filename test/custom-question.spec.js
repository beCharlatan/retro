// test/custom-question.spec.js
// Quiz-style games (crowd-wisdom so far, calibration and
// false-consensus to follow the same pattern) default to a built-in
// question but let the facilitator swap in their own fact-with-a-
// known-answer before collecting guesses. Locks in: the default flow
// is unchanged when nobody customizes anything, the custom question
// text/answer/unit actually propagate through to the entry screen,
// the results reveal, the answer paragraph, the chart's true-value
// line, and every row of the results table.

const { Report, openPage, withBrowser } = require('./lib');

async function run() {
  const report = new Report();
  report.section('Custom questions in quiz-style games');

  await withBrowser(async (browser) => {
    // --- crowd-wisdom: default (regression) ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Мудрость толпы');
      await page.waitForTimeout(100);
      await page.click('button:has-text("Вносить данные")');
      const inputs = await page.$$('#entry-body input');
      for (let i = 0; i < inputs.length; i++) await inputs[i].fill(String(400 + i * 5));
      await page.click('button:has-text("Показать результаты")');
      await page.waitForTimeout(150);
      const trueVal = await page.textContent('#true-value-display');
      report.check(
        'crowd-wisdom: default question still reveals 420 т (no regression)',
        trueVal.trim() === '420 т',
        trueVal.trim(),
      );
      await page.close();
    }

    // --- crowd-wisdom: custom question end-to-end ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Мудрость толпы');
      await page.waitForTimeout(100);

      const panelHiddenInitially = await page.getAttribute('#custom-q-panel', 'hidden');
      report.check(
        'crowd-wisdom: custom-question panel starts collapsed',
        panelHiddenInitially !== null,
      );

      await page.click('#custom-q-toggle');
      await page.waitForTimeout(80);
      await page.fill('#custom-q-text', 'Сколько строк кода в нашем репозитории?');
      await page.fill('#custom-q-answer', '48000');
      await page.fill('#custom-q-unit', 'строк');
      await page.click('#custom-q-apply');
      await page.waitForTimeout(100);

      const questionText = await page.textContent('#cw-question-text');
      report.check(
        'crowd-wisdom: instructions screen shows the custom question text',
        questionText.includes('строк кода в нашем репозитории'),
        questionText,
      );

      await page.click('button:has-text("Вносить данные")');
      const inputs = await page.$$('#entry-body input');
      report.check(
        'crowd-wisdom: entry screen still has one row per participant',
        inputs.length > 0,
      );
      for (let i = 0; i < inputs.length; i++) await inputs[i].fill(String(40000 + i * 1000));
      await page.click('button:has-text("Показать результаты")');
      await page.waitForTimeout(150);

      const trueVal = await page.textContent('#true-value-display');
      report.check(
        'crowd-wisdom: reveal shows the custom answer + custom unit',
        trueVal.trim() === '48000 строк',
        trueVal.trim(),
      );

      const truePara = await page.textContent('#true-value-para');
      report.check(
        'crowd-wisdom: answer paragraph is generic (not the hardcoded ISS sentence)',
        truePara.includes('48000 строк') && !truePara.includes('станция'),
        truePara.trim(),
      );

      const firstRow = await page.textContent('#results-tbody tr');
      report.check(
        'crowd-wisdom: results table rows use the custom unit',
        firstRow.includes('строк'),
        firstRow.trim(),
      );

      const printHeader = await page.$eval('#print-header-crowd-wisdom', (el) => el.innerHTML);
      report.check(
        'crowd-wisdom: PDF subtitle uses the custom question, not the default one',
        printHeader.includes('строк кода в нашем репозитории'),
      );

      await page.close();
    }

    // --- crowd-wisdom: reset-to-default button works ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Мудрость толпы');
      await page.waitForTimeout(100);
      await page.click('#custom-q-toggle');
      await page.fill('#custom-q-text', 'Тестовый вопрос');
      await page.fill('#custom-q-answer', '999');
      await page.click('#custom-q-apply');
      await page.waitForTimeout(80);
      await page.click('#custom-q-reset');
      await page.waitForTimeout(80);
      const questionText = await page.textContent('#cw-question-text');
      report.check(
        'crowd-wisdom: "Вернуть стандартный" restores the ISS question',
        questionText.includes('Международная космическая станция'),
        questionText,
      );
      await page.close();
    }

    // --- calibration: default flow (regression) ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Калибровка уверенности');
      await page.waitForTimeout(100);
      const h2 = await page.textContent('#q-heading-0');
      report.check(
        'calibration: default question 1 is still the Google one',
        h2.includes('Google'),
        h2.trim(),
      );
      await page.close();
    }

    // --- calibration: replace only ONE of three questions, leave the other two default ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Калибровка уверенности');
      await page.waitForTimeout(100);
      await page.click('#custom-q-toggle');
      await page.waitForTimeout(80);

      await page.fill('#custom-q-text-1', 'Сколько сотрудников в нашей компании?');
      await page.fill('#custom-q-answer-1', '85');
      await page.fill('#custom-q-unit-1', 'человек');
      await page.click('#custom-q-apply');
      await page.waitForTimeout(100);

      const h0 = await page.textContent('#q-heading-0');
      const h1 = await page.textContent('#q-heading-1');
      const h2 = await page.textContent('#q-heading-2');
      report.check(
        'calibration: question 1 stays default when only Q2 is customized',
        h0.includes('Google'),
      );
      report.check(
        'calibration: question 2 shows the custom text',
        h1.includes('сотрудников в нашей компании'),
      );
      report.check(
        'calibration: question 3 stays default when only Q2 is customized',
        h2.includes('Волга'),
      );

      await page.click('button:has-text("Начать вопросы")');
      await page.waitForTimeout(100);
      for (let q = 0; q < 3; q++) {
        const inputs = await page.$$('.screen.active input');
        for (let i = 0; i < inputs.length; i += 2) {
          await inputs[i].fill('0');
          await inputs[i + 1].fill('999999');
        }
        await page.click(`#next-btn-${q}`);
        await page.waitForTimeout(100);
      }
      const reveal = await page.textContent('#answers-reveal');
      report.check(
        'calibration: revealed answers mix custom Q2 with default Q1/Q3',
        reveal.includes('1998') && reveal.includes('85 человек') && reveal.includes('3530 км'),
        reveal.trim(),
      );
      await page.close();
    }

    // --- calibration: partial fill (text without answer) is rejected, not silently applied ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Калибровка уверенности');
      await page.waitForTimeout(100);
      await page.click('#custom-q-toggle');
      await page.fill('#custom-q-text-0', 'Только текст, без ответа');
      await page.click('#custom-q-apply');
      await page.waitForTimeout(80);
      const status = await page.textContent('#custom-q-status');
      const h0 = await page.textContent('#q-heading-0');
      report.check(
        'calibration: half-filled question slot shows a validation message, not applied',
        status.length > 0 && h0.includes('Google'),
        status.trim(),
      );
      await page.close();
    }

    // --- false-consensus: default flow (regression) ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Ложный консенсус');
      await page.waitForTimeout(100);
      const qText = await page.textContent('#fc-question-text');
      report.check(
        'false-consensus: default question is still the presentation one (no regression)',
        qText.includes('презентацию'),
        qText.trim(),
      );
      await page.close();
    }

    // --- false-consensus: custom question end-to-end ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Ложный консенсус');
      await page.waitForTimeout(100);

      const panelHiddenInitially = await page.getAttribute('#custom-q-panel', 'hidden');
      report.check(
        'false-consensus: custom-question panel starts collapsed',
        panelHiddenInitially !== null,
      );

      await page.click('#custom-q-toggle');
      await page.waitForTimeout(80);
      await page.click('#custom-q-apply'); // empty text -> should be rejected
      await page.waitForTimeout(80);
      const emptyStatus = await page.textContent('#custom-q-status');
      report.check(
        'false-consensus: applying an empty question shows a validation message',
        emptyStatus.length > 0,
        emptyStatus.trim(),
      );

      await page.fill(
        '#custom-q-text',
        'Готовы ли вы прямо сейчас взяться за тикет без документации?',
      );
      await page.click('#custom-q-apply');
      await page.waitForTimeout(100);
      const qText = await page.textContent('#fc-question-text');
      report.check(
        'false-consensus: instructions screen shows the custom question text',
        qText.includes('тикет без документации'),
        qText.trim(),
      );

      await page.click('button:has-text("Вносить данные")');
      const rows = await page.$$('#entry-body .entry-row');
      report.check(
        'false-consensus: entry screen still has one row per participant',
        rows.length > 0,
      );
      for (let i = 0; i < rows.length; i++) {
        const val = i % 2 === 0 ? 'yes' : 'no';
        await (await rows[i].$(`button[data-val="${val}"]`)).click();
        await (await rows[i].$('input')).fill(String(40 + i));
      }
      await page.click('button:has-text("Показать результаты")');
      await page.waitForTimeout(150);

      const printHeader = await page.$eval('#print-header-false-consensus', (el) => el.innerHTML);
      report.check(
        'false-consensus: PDF subtitle uses the custom question, not the default one',
        printHeader.includes('тикет без документации'),
      );

      await page.close();
    }

    // --- false-consensus: reset-to-default button works ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Ложный консенсус');
      await page.waitForTimeout(100);
      await page.click('#custom-q-toggle');
      await page.fill('#custom-q-text', 'Тестовый вопрос');
      await page.click('#custom-q-apply');
      await page.waitForTimeout(80);
      await page.click('#custom-q-reset');
      await page.waitForTimeout(80);
      const qText = await page.textContent('#fc-question-text');
      report.check(
        'false-consensus: "Вернуть стандартный" restores the presentation question',
        qText.includes('презентацию'),
        qText.trim(),
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
