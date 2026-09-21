// test/public-goods-calibration.spec.js
// Общественное благо: a 20-second timer on each of the two rounds, and a
// round-1 recap at the top of round 2 (aggregates only) so people can orient
// by it. Калибровка уверенности: four very hard specialist questions
// (chemistry, history, biology, geography) and a 20-second timer per question.

const { Report, openPage, withBrowser, openGameFromHome } = require('./lib');
const { GAMES } = require('./games');

async function run() {
  const report = new Report();
  report.section('Общественное благо и Калибровка — timers, recap, hard questions');

  await withBrowser(async (browser) => {
    // ---------------- Общественное благо ----------------
    {
      const page = await openPage(browser, report);
      try {
        await openGameFromHome(page, 'public-goods');
        await page.click('button:has-text("Раунд 1")');
        await page.waitForTimeout(150);

        const val = (round) => page.$eval(`#round-${round} .round-timer-input`, (el) => el.value);
        report.check('round 1 has a timer, default 0:20', (await val(1)) === '0:20');
        report.check('round 2 has its own timer, default 0:20', (await val(2)) === '0:20');
        report.check(
          'the timers are the compact one-row widget above the table',
          (await page.$$('#round-1 .round-timer.compact, #round-2 .round-timer.compact')).length ===
            2,
        );

        await page.$eval('#round-2 button[aria-label="Увеличить время"]', (b) => b.click());
        report.check(
          'round 2’s length is independent (0:25) and round 1’s untouched',
          (await val(2)) === '0:25' && (await val(1)) === '0:20',
        );
        await page.click('#round-1 .round-timer-actions .ghost');
        await page.waitForTimeout(1200);
        report.check(
          'round 1’s timer counts down',
          /^0:1[89]$/.test((await page.textContent('#round-1 .round-timer-time')).trim()),
        );

        // Fill round 1 with known contributions: 100, 50, 0, then 30 for everyone else.
        const inputs = await page.$$('[data-testid="entry-body-1"] input');
        const values = inputs.map((_, i) => [100, 50, 0][i] ?? 30);
        for (let i = 0; i < inputs.length; i++) await inputs[i].fill(String(values[i]));
        const total = values.reduce((a, b) => a + b, 0);
        const n = values.length;
        await page.click('[data-testid="next-btn-1"]');
        await page.waitForTimeout(500);
        report.check(
          'leaving round 1 stops its timer',
          (await page.$('#round-1 .round-timer.running')) === null,
        );

        const recap = (await page.textContent('#round1-recap')).replace(/\s+/g, ' ');
        report.check(
          'round 2 opens with a "Как прошёл раунд 1" recap',
          recap.includes('Как прошёл раунд 1'),
        );
        const nums = await page.$$eval('#round1-recap .round-recap-stat .n', (els) =>
          els.map((e) => e.textContent.trim()),
        );
        const round1 = (x) => String(Math.round(x * 10) / 10);
        report.check(
          'recap: the average contribution is right',
          nums[0] === round1(total / n),
          `${nums[0]} vs ${round1(total / n)}`,
        );
        report.check(
          'recap: the pot after doubling is right',
          nums[1] === round1(total * 2),
          `${nums[1]} vs ${round1(total * 2)}`,
        );
        report.check(
          'recap: the equal share per player is right',
          nums[2] === round1((total * 2) / n),
          `${nums[2]} vs ${round1((total * 2) / n)}`,
        );
        report.check('recap: the range 0–100 is stated', recap.includes('от 0 до 100'));
        report.check(
          'recap: says how many kept everything / gave everything',
          recap.includes('Ничего не вложили: 1') && recap.includes('Вложили всё: 1'),
        );
        const names = await page.$$eval('#round1-recap .name-with-avatar', (els) => els.length);
        report.check('recap shows aggregates only — no individual names', names === 0);
        report.check(
          'the recap sits above the round-2 table',
          await page.evaluate(() => {
            const deep = (r, s, o = []) => {
              r.querySelectorAll(s).forEach((e) => {
                o.push(e);
              });
              r.querySelectorAll('*').forEach((e) => {
                if (e.shadowRoot) deep(e.shadowRoot, s, o);
              });
              return o;
            };
            return (
              deep(document, '#round1-recap')[0].getBoundingClientRect().top <
              deep(document, '#round-2 .entry-head')[0].getBoundingClientRect().top
            );
          }),
        );
        report.check(
          'round 1’s recap is not shown in round 1',
          (await page.$('#round-1 #round1-recap')) === null,
        );
      } catch (e) {
        report.fail('public goods: threw', e.message);
      }
      await page.close();
    }

    // ---------------- Калибровка ----------------
    {
      const page = await openPage(browser, report);
      try {
        await openGameFromHome(page, 'calibration');
        await page.waitForTimeout(150);
        const heads = await Promise.all(
          [0, 1, 2, 3].map((i) => page.textContent(`#q-heading-${i}`).then((t) => t.trim())),
        );
        report.check(
          'there are four default questions',
          (await page.$$('[id^="q-heading-"]')).length === 4,
        );
        report.check('chemistry: melting point of tungsten', /вольфрам/i.test(heads[0]));
        report.check('history: the battle of Manzikert', /Манцикерт/.test(heads[1]));
        report.check(
          'biology: chromosomes of a dog',
          /хромосом/.test(heads[2]) && /собак/.test(heads[2]),
        );
        report.check('geography: the elevation of lake Titicaca', /Титикака/.test(heads[3]));
        report.check(
          'none of them is a general-knowledge staple (Google, Everest, Volga, …)',
          heads.every((h) => !/(Google|Эверест|Волга|Килиманджаро|Нил|Байкал)/.test(h)),
        );

        const val = (i) => page.$eval(`#round-${1 + i} .round-timer-input`, (el) => el.value);
        const all = await Promise.all([0, 1, 2, 3].map(val));
        report.check(
          'every question has a timer, default 0:20',
          all.every((v) => v === '0:20'),
          all.join(','),
        );
        await page.$eval('#round-2 button[aria-label="Увеличить время"]', (b) => b.click());
        report.check(
          'a question’s timer can be changed on its own',
          (await val(1)) === '0:25' && (await val(0)) === '0:20',
        );

        await page.click('button:has-text("Начать вопросы")');
        await page.waitForTimeout(200);
        await page.click('#round-1 .round-timer-actions .ghost');
        await page.waitForTimeout(1200);
        report.check(
          'question 1’s timer counts down',
          /^0:1[89]$/.test((await page.textContent('#round-1 .round-timer-time')).trim()),
        );
        const game = GAMES.find((g) => g.id === 'calibration');
        await game.fill(page, {});
        await page.click('#next-btn-0');
        await page.waitForTimeout(400);
        report.check(
          'moving to the next question stops the running timer',
          (await page.$('#round-1 .round-timer.running')) === null,
        );

        // The rest of the flow still works and reveals the four answers.
        for (let q = 1; q < 4; q++) {
          const inputs = await page.$$(`#entry-body-${q} input`);
          for (let i = 0; i < inputs.length; i += 2) {
            await inputs[i].fill('0');
            await inputs[i + 1].fill('5000');
          }
          await page.click(`#next-btn-${q}`);
          await page.waitForTimeout(150);
        }
        const reveal = await page.textContent('#answers-reveal');
        report.check(
          'the results reveal all four answers with their units',
          ['3422 °C', '1071', '78 хромосом', '3812 м'].every((a) => reveal.includes(a)),
          reveal.trim(),
        );
      } catch (e) {
        report.fail('calibration: threw', e.message);
      }
      await page.close();
    }
  });

  return report;
}

module.exports = { run };

if (require.main === module) {
  run().then((r) => process.exit(r.summary() ? 0 : 1));
}
