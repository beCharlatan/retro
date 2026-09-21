// test/framing.spec.js
// Эффект фрейминга has TWO scenarios: 1) the classic 600-people programme,
// 2) a work situation — 30 critical bugs before a release. Same choice in a
// gain wording ("fix 10") and a loss wording ("miss 20"). In scenario 1
// group A hears the gain wording, in scenario 2 the groups swap, so everyone
// meets both wordings. Flow:
//   intro → roles → scenario 1 → scenario 2 → entry → results → context

const { Report, openPage, withBrowser, openGameFromHome } = require('./lib');

const startFraming = async (page) => {
  await openGameFromHome(page, 'framing');
  await page.click('button:has-text("Распределить группы")');
  await page.waitForTimeout(80);
  await page.click('button:has-text("Дальше")');
  await page.waitForTimeout(150);
};

// Scenario 2 is still locked (blurred, inert) until scenario 1 is completed, so a
// real pointer click on it would hit the lock overlay — call the button's own click().
const jsClick = (page, selector) => page.$eval(selector, (el) => el.click());

const shown = (page, key) =>
  page.$eval(`#text-${key}`, (el) => el.textContent.replace(/\s+/g, ' ').trim());

async function run() {
  const report = new Report();
  report.section('Эффект фрейминга — two scenarios (project + release bugs)');

  await withBrowser(async (browser) => {
    // --- flow and wording ---
    {
      const page = await openPage(browser, report);
      try {
        await startFraming(page);
        const rounds = await page.$$eval('.round', (els) => els.map((e) => e.id));
        report.check(
          'rounds: intro, roles, 2 scenarios, entry, results, context',
          rounds.join() === 'round-0,round-1,round-2,round-3,round-4,round-5,round-6',
          rounds.join(),
        );
        const steps = await page.$$eval(
          '.trail-svg-wrap svg circle.trail-node',
          (els) => els.length,
        );
        report.check('the progress trail has 7 steps', steps === 7, `steps=${steps}`);

        const s1 = (await page.textContent('#round-2')).replace(/\s+/g, ' ');
        const s2 = (await page.textContent('#round-3')).replace(/\s+/g, ' ');
        report.check('scenario 1 is the 600-people project', s1.includes('600 человек'));
        report.check(
          'scenario 2 is the work situation with bugs',
          s2.includes('30 критичных багов') && s2.includes('релиз'),
        );
        report.check(
          'nothing on screen tells the room the groups swap wordings (it would spoil the experiment)',
          !s2.includes('меняются формулировками') &&
            !s2.includes('услышит «потерю»') &&
            !(await page.textContent('#round-0')).includes('меняются формулировками'),
        );

        for (const id of ['#toggle-a', '#toggle-b', '#toggle-a2', '#toggle-b2'])
          await jsClick(page, id);
        const [a1, b1, a2, b2] = await Promise.all(
          ['a', 'b', 'a2', 'b2'].map((k) => shown(page, k)),
        );
        report.check(
          'scenario 1: group A hears the GAIN wording (saved 200)',
          a1.includes('спасено ровно 200'),
        );
        report.check(
          'scenario 1: group B hears the LOSS wording (400 die)',
          b1.includes('умрёт ровно 400'),
        );
        report.check(
          'scenario 2: group A now hears the LOSS wording (miss 20 bugs)',
          a2.includes('пропустим в релиз ровно 20 багов'),
        );
        report.check(
          'scenario 2: group B now hears the GAIN wording (fix 10 bugs)',
          b2.includes('исправим ровно 10 багов'),
        );
        report.check(
          'the two wordings of scenario 2 are the same choice (10 fixed of 30 = 20 missed)',
          a2.includes('20') && b2.includes('10') && a2.includes('30') && b2.includes('30'),
        );

        report.check(
          'each scenario has its own timer',
          (await page.$$('.round-timer')).length === 2,
        );
      } catch (e) {
        report.fail('flow: threw', e.message);
      }
      await page.close();
    }

    // --- copy buttons per scenario ---
    {
      const ctx = await browser.newContext({
        viewport: { width: 1000, height: 1300 },
        reducedMotion: 'reduce',
      });
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
      const page = await ctx.newPage();
      try {
        await page.goto(
          `file://${require('node:path').join(__dirname, '..', 'dist', 'index.html')}`,
        );
        await startFraming(page);
        const clip = async (id) => {
          await jsClick(page, id);
          await page.waitForTimeout(120);
          return page.evaluate(() => navigator.clipboard.readText());
        };
        const a1 = await clip('#copy-a');
        const b2 = await clip('#copy-b2');
        const a2 = await clip('#copy-a2');
        report.check(
          'copy A / scenario 1 gives the gain text',
          a1.includes('спасено ровно 200') && !a1.includes('баг'),
        );
        report.check(
          'copy B / scenario 2 gives the gain-wording bug text',
          b2.includes('исправим ровно 10 багов') && b2.includes('Какую стратегию вы выбираете?'),
        );
        report.check(
          'copy A / scenario 2 gives the loss-wording bug text',
          a2.includes('пропустим в релиз ровно 20 багов') && !a2.includes('исправим ровно 10'),
        );
        report.check(
          'the copied text names both strategies',
          a2.includes('Стратегия 1') && a2.includes('Стратегия 2'),
        );
      } catch (e) {
        report.fail('copy: threw', e.message);
      }
      await ctx.close();
    }

    // --- timers per scenario ---
    {
      const page = await openPage(browser, report);
      try {
        await startFraming(page);
        const val = (round) => page.$eval(`#round-${round} .round-timer-input`, (el) => el.value);
        report.check(
          'both timers start at 0:40',
          (await val(2)) === '0:40' && (await val(3)) === '0:40',
        );
        await jsClick(page, '#round-3 button[aria-label="Увеличить время"]');
        report.check(
          'scenario 2’s timer can be changed on its own',
          (await val(3)) === '0:45' && (await val(2)) === '0:40',
        );
        await page.click('#round-2 .round-timer-actions .ghost');
        await page.waitForTimeout(1200);
        report.check(
          'a running timer belongs to one scenario only',
          (await page.$('#round-2 .round-timer.running')) !== null &&
            (await page.$('#round-3 .round-timer.running')) === null,
        );
        await page.click('#next-scenario-0');
        await page.waitForTimeout(500);
        report.check(
          'moving on stops it',
          (await page.$('#round-2 .round-timer.running')) === null,
        );
      } catch (e) {
        report.fail('timers: threw', e.message);
      }
      await page.close();
    }

    // --- entry, gate, results ---
    {
      const page = await openPage(browser, report);
      try {
        await startFraming(page);
        await page.click('#next-scenario-0');
        await page.waitForTimeout(100);
        await page.click('#next-scenario-1');
        await page.waitForTimeout(300);

        const cards = await page.$$('#entry-body .team-entry-card');
        report.check(
          'everyone has a card with two choices (project + release)',
          cards.length >= 14 &&
            (await Promise.all(cards.map((c) => c.$$('.choice-row')))).every((r) => r.length === 2),
        );
        report.check(
          'the choice buttons are labelled Программа / Стратегия',
          (await cards[0].textContent()).includes('Программа 1') &&
            (await cards[0].textContent()).includes('Стратегия 2'),
        );

        // The two choice rows must sit INSIDE the card (they used to spill past its right edge).
        const overflow = await page.$$eval(
          '#entry-body .team-entry-card',
          (els) =>
            els.filter((card) => {
              const box = card.getBoundingClientRect();
              return [...card.querySelectorAll('.toggle-pair button')].some(
                (b) => b.getBoundingClientRect().right > box.right + 1,
              );
            }).length,
        );
        report.check(
          'the choice buttons stay inside their card (no overflow)',
          overflow === 0,
          `${overflow} cards overflow`,
        );

        const disabled = () => page.$eval('#next-btn', (b) => b.disabled);
        report.check('results are locked while nothing is answered', await disabled());

        // Answer ONLY scenario 1, for everyone: scenario 2 is still empty → still locked.
        for (const c of cards)
          await (await c.$('.choice-row[data-round="0"] button[data-val="1"]')).click();
        report.check('answering only scenario 1 is not enough', await disabled());

        // Scenario 2: only group A answers.
        const groupA = await page.$$('#entry-body .team-a .team-entry-card');
        for (const c of groupA)
          await (await c.$('.choice-row[data-round="1"] button[data-val="1"]')).click();
        report.check('scenario 2 needs BOTH groups to have answered', await disabled());

        const groupB = await page.$$('#entry-body .team-b .team-entry-card');
        for (const c of groupB)
          await (await c.$('.choice-row[data-round="1"] button[data-val="1"]')).click();
        report.check(
          'once both groups answered both scenarios the results unlock',
          !(await disabled()),
        );

        // Make the effect visible: loss-wording people gamble ('2'), gain-wording people play safe ('1').
        //   scenario 1: B is loss;  scenario 2: A is loss.
        for (const c of groupB)
          await (await c.$('.choice-row[data-round="0"] button[data-val="2"]')).click();
        for (const c of groupA)
          await (await c.$('.choice-row[data-round="1"] button[data-val="2"]')).click();

        await page.click('#next-btn');
        await page.waitForTimeout(600);
        const headline = (await page.textContent('.reveal .n')).trim();
        report.check(
          'the headline says the wording worked in both scenarios',
          headline === 'Сработала в 2 из 2',
          headline,
        );
        const verdict = await page.textContent('.reveal-verdict');
        report.check(
          'the verdict lists the project and the release scenario',
          verdict.includes('Проект') && verdict.includes('Релиз'),
          verdict.trim().slice(0, 120),
        );
        report.check('the verdict mentions the work example', verdict.includes('рабочем примере'));

        // Both wordings of both scenarios are printed on the results, with who heard which.
        const resultsText = (await page.textContent('#round-5')).replace(/\s+/g, ' ');
        report.check(
          'results print the scenario 1 gain wording (saved 200)',
          resultsText.includes('спасено ровно 200 человек'),
        );
        report.check(
          'results print the scenario 1 loss wording (400 die)',
          resultsText.includes('умрёт ровно 400 человек'),
        );
        report.check(
          'results print the scenario 2 gain wording (fix 10 bugs)',
          resultsText.includes('исправим ровно 10 багов'),
        );
        report.check(
          'results print the scenario 2 loss wording (miss 20 bugs)',
          resultsText.includes('пропустим в релиз ровно 20 багов'),
        );
        const cardTitles = await page.$$eval('.wording-card > .t:first-child', (els) =>
          els.map((e) => e.textContent.trim()),
        );
        report.check(
          'each wording card says which group heard it (scenario 1: gain→А, loss→Б; scenario 2 swapped)',
          cardTitles.length === 4 &&
            cardTitles[0].includes('выигрыша') &&
            cardTitles[0].includes('группа А') &&
            cardTitles[1].includes('потери') &&
            cardTitles[1].includes('группа Б') &&
            cardTitles[2].includes('выигрыша') &&
            cardTitles[2].includes('группа Б') &&
            cardTitles[3].includes('потери') &&
            cardTitles[3].includes('группа А'),
          cardTitles.join(' | '),
        );
        const heard = await page.$$eval('.wording-card .wording-members', (els) =>
          els.map((e) => e.querySelectorAll('.role-chip').length),
        );
        report.check(
          'every card lists the colleagues who heard that wording',
          heard.length === 4 &&
            heard.every((n) => n > 0) &&
            heard[0] + heard[1] === heard[2] + heard[3],
          heard.join(','),
        );

        const titles = await page.$$eval('.scenario-result-title', (els) =>
          els.map((e) => e.textContent.trim()),
        );
        report.check(
          'the results have a block for each scenario',
          titles.length === 2 && titles[0].includes('Проект') && titles[1].includes('Релиз'),
          titles.join(' | '),
        );
        const charts = await page.$$eval('.d3-chart-svg circle.answer-dot', (els) => els.length);
        report.check(
          'each scenario draws a dot per answer (2 × everyone)',
          charts === cards.length * 2,
          `dots=${charts}`,
        );
        const risk = await page.$$eval('.group-compare .v', (els) =>
          els.map((e) => e.textContent.trim()),
        );
        report.check(
          'scenario 1: gain-wording group 0% risk, loss-wording group 100%',
          risk[0] === '0%' && risk[1] === '100%',
          risk.join(' / '),
        );
        report.check(
          'scenario 2 shows the same on its own numbers',
          risk[2] === '0%' && risk[3] === '100%',
          risk.join(' / '),
        );

        const rows = await page.$$eval('#results-tbody tr', (els) =>
          els.map((e) => e.textContent.replace(/\s+/g, ' ')),
        );
        report.check(
          'the table shows both choices with the wording each person heard',
          rows.length === cards.length &&
            rows.every(
              (r) =>
                /Программа [12] · (выигрыш|потеря)/.test(r) &&
                /Стратегия [12] · (выигрыш|потеря)/.test(r),
            ),
          rows[0],
        );
        const data = await page.evaluate(() => window.__reportData);
        report.check(
          'the export names the two scenarios',
          !!data && data.meta.extra.includes('2 сценария'),
          JSON.stringify(data?.meta),
        );
      } catch (e) {
        report.fail('entry/results: threw', e.message);
      }
      await page.close();
    }

    // --- the entry form also fits a phone-width screen ---
    {
      const ctx = await browser.newContext({
        viewport: { width: 420, height: 900 },
        reducedMotion: 'reduce',
      });
      const page = await ctx.newPage();
      try {
        await page.goto(
          `file://${require('node:path').join(__dirname, '..', 'dist', 'index.html')}`,
        );
        // (icons sit under the HUD panels on a phone, so open the game with the button's own click)
        await page.$eval('[data-game-id="framing"]', (el) => el.click());
        await page.waitForTimeout(400);
        await page.click('button:has-text("Начать игру")');
        await page.waitForTimeout(500);
        for (const sel of [
          'button:has-text("Распределить группы")',
          'button:has-text("Дальше")',
          '#next-scenario-0',
          '#next-scenario-1',
        ]) {
          await page.click(sel);
          await page.waitForTimeout(150);
        }
        const bad = await page.$$eval(
          '#entry-body .team-entry-card',
          (els) =>
            els.filter((card) =>
              [...card.querySelectorAll('.toggle-pair button')].some(
                (b) => b.getBoundingClientRect().right > card.getBoundingClientRect().right + 1,
              ),
            ).length,
        );
        report.check(
          'on a 420px screen the choice buttons stay inside their cards',
          bad === 0,
          `${bad} overflow`,
        );
        report.check(
          'and the page does not scroll sideways',
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        );
      } catch (e) {
        report.fail('phone layout: threw', e.message);
      }
      await ctx.close();
    }

    // --- an old single-scenario draft must not break the game ---
    {
      const page = await openPage(browser, report);
      try {
        await page.evaluate(() => {
          const names = [
            'Михаил',
            'Виктория',
            'Ирина',
            'Айшат',
            'Екатерина',
            'Олег',
            'Мухамед',
            'Артём',
            'Марат',
            'Арина',
            'Таня',
            'Денис',
            'Диана',
            'Анатолий',
          ];
          const entries = names.map((name, i) => ({ name, group: i % 2 ? 'B' : 'A', choice: '2' }));
          sessionStorage.setItem(
            'retro-draft-framing',
            JSON.stringify({
              payload: { groups: { groupA: names.slice(0, 7), groupB: names.slice(7) }, entries },
              savedAt: Date.now(),
            }),
          );
        });
        await openGameFromHome(page, 'framing');
        await page.waitForTimeout(200);
        report.check(
          'an old-format draft is ignored (no banner, no crash)',
          !(await page.isVisible('.draft-banner')),
        );
      } catch (e) {
        report.fail('old draft: threw', e.message);
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
