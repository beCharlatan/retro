// test/endowment.spec.js
// Эффект владения is ONE role for the whole game (a group sells, the other
// buys) across THREE lots of growing value — a mug, a car, a house:
//   intro → roles → lot 1 → lot 2 → lot 3 → enter all prices → results → context
// This locks in the shape of that flow: fixed roles, a description + its own
// timer per lot, a single entry screen with a price per lot, the gate that
// needs both sides to have priced every lot, and per-lot results.

const { Report, openPage, withBrowser, openGameFromHome } = require('./lib');

const goToLot1 = async (page) => {
  await page.click('button:has-text("Распределить группы")');
  await page.waitForTimeout(100);
  await page.click('button:has-text("Лот 1")');
  await page.waitForTimeout(150);
};

const chipsOf = (page, roundId, teamClass) =>
  page.$$eval(`${roundId} .lot-roles .${teamClass} .role-chip`, (els) =>
    els.map((e) => e.textContent.trim()),
  );

async function run() {
  const report = new Report();
  report.section('Эффект владения — one role, three lots');

  await withBrowser(async (browser) => {
    // --- the roster has Анатолий ---
    {
      const page = await openPage(browser, report);
      try {
        await page.click('.roster-toggle');
        await page.waitForTimeout(450);
        const names = await page.$$eval('.roster-panel .chip', (els) =>
          els.map((e) => e.textContent),
        );
        report.check(
          'the permanent roster includes Анатолий',
          names.some((n) => n.includes('Анатолий')),
          names.join(', ').slice(0, 120),
        );
        const count = parseInt(await page.textContent('.panel-head .count'), 10);
        report.check('the participant counter counts him too', count >= 14, `count=${count}`);
      } catch (e) {
        report.fail('roster: threw', e.message);
      }
      await page.close();
    }

    // --- flow shape ---
    {
      const page = await openPage(browser, report);
      try {
        await openGameFromHome(page, 'endowment');
        await page.waitForTimeout(150);

        const steps = await page.$$eval(
          '.trail-svg-wrap svg circle.trail-node',
          (els) => els.length,
        );
        report.check(
          'the progress trail has 8 steps (intro, roles, 3 lots, entry, results, context)',
          steps === 8,
          `steps=${steps}`,
        );

        await goToLot1(page);
        const rounds = await page.$$eval('.round', (els) => els.map((e) => e.id));
        report.check(
          'rounds are: intro, roles, 3 lots, entry, results, context',
          rounds.join() === 'round-0,round-1,round-2,round-3,round-4,round-5,round-6,round-7',
          rounds.join(),
        );

        const lotText = async (i) =>
          (await page.textContent(`#round-${2 + i}`)).replace(/\s+/g, ' ');
        report.check('lot 1 describes a mug', /кружк/i.test(await lotText(0)));
        report.check('lot 2 describes a car', /автомобил/i.test(await lotText(1)));
        report.check('lot 3 describes a house', /дом/i.test(await lotText(2)));
        report.check(
          'every lot tells owners to name a minimum and buyers a maximum',
          (await Promise.all([0, 1, 2].map(lotText))).every(
            (t) => t.includes('минимальную цену') && t.includes('максимальную цену'),
          ),
        );
        report.check(
          'every lot has its own timer card',
          (await page.$$('.round-timer')).length === 3,
        );

        // roles are the SAME for all lots
        const owners = [
          await chipsOf(page, '#round-2', 'team-a'),
          await chipsOf(page, '#round-3', 'team-a'),
          await chipsOf(page, '#round-4', 'team-a'),
        ];
        const buyers = [
          await chipsOf(page, '#round-2', 'team-b'),
          await chipsOf(page, '#round-3', 'team-b'),
          await chipsOf(page, '#round-4', 'team-b'),
        ];
        report.check(
          'the owners are the same people in all three lots (roles do not swap)',
          JSON.stringify(owners[0]) === JSON.stringify(owners[1]) &&
            JSON.stringify(owners[1]) === JSON.stringify(owners[2]) &&
            owners[0].length > 0,
        );
        report.check(
          'the buyers are the same people in all three lots',
          JSON.stringify(buyers[0]) === JSON.stringify(buyers[1]) &&
            JSON.stringify(buyers[1]) === JSON.stringify(buyers[2]) &&
            buyers[0].length > 0,
        );
        report.check(
          'nobody is both an owner and a buyer',
          owners[0].every((n) => !buyers[0].includes(n)),
        );
        report.check(
          'everyone is in one of the two groups',
          owners[0].length + buyers[0].length >= 14,
        );
      } catch (e) {
        report.fail('flow: threw', e.message);
      }
      await page.close();
    }

    // --- per-lot timers ---
    {
      const page = await openPage(browser, report);
      try {
        await openGameFromHome(page, 'endowment');
        await goToLot1(page);
        const val = (round) => page.$eval(`#round-${round} .round-timer-input`, (el) => el.value);
        report.check(
          'each lot timer starts at the default 1:00',
          (await val(2)) === '1:00' && (await val(3)) === '1:00',
        );
        await page.click('#round-2 button[aria-label="Увеличить время"]');
        await page.click('#round-2 button[aria-label="Увеличить время"]');
        report.check('lot 1’s timer can be lengthened (1:30)', (await val(2)) === '1:30');
        report.check('lot 2’s timer is unaffected', (await val(3)) === '1:00');
        await page.click('#round-2 .round-timer-actions .ghost');
        await page.waitForTimeout(1200);
        report.check(
          'lot 1’s timer runs from its own length',
          /^1:2[89]$/.test((await page.textContent('#round-2 .round-timer-time')).trim()),
        );
        report.check('lot 2’s timer stays idle meanwhile', (await val(3)) === '1:00');
        await page.click('#next-lot-0'); // moving on stops and resets the running timer
        await page.waitForTimeout(500);
        report.check(
          'leaving a lot stops its timer',
          (await page.$('#round-2 .round-timer.running')) === null,
        );
      } catch (e) {
        report.fail('timers: threw', e.message);
      }
      await page.close();
    }

    // --- entry screen + gate + results ---
    {
      const page = await openPage(browser, report);
      try {
        await openGameFromHome(page, 'endowment');
        await goToLot1(page);
        await page.click('#next-lot-0');
        await page.click('#next-lot-1');
        await page.click('#next-lot-2');
        await page.waitForTimeout(300);

        const inputs = await page.$$('#entry-body input');
        const people = inputs.length / 3;
        report.check(
          'the entry screen has three price inputs per person',
          inputs.length > 0 && inputs.length % 3 === 0,
          `inputs=${inputs.length}`,
        );
        report.check('everyone in the room has a row', people >= 14, `people=${people}`);
        const headers = await page.$$eval('#entry-body .entry-head', (els) =>
          els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
        );
        report.check(
          'both sections label the columns Кружка / Автомобиль / Дом',
          headers.length === 2 &&
            headers.every(
              (h) => h.includes('Кружка') && h.includes('Автомобиль') && h.includes('Дом'),
            ),
          headers.join(' | '),
        );

        const nextDisabled = () => page.$eval('#next-btn', (b) => b.disabled);
        report.check('results are locked while nothing is entered', await nextDisabled());

        // Fill ONLY the owners (first section): buyers have priced nothing.
        const ownerRows = await page.$$('#entry-body .team-a .entry-row');
        for (const row of ownerRows)
          for (const input of await row.$$('input')) await input.fill('1000');
        report.check(
          'owners alone are not enough — buyers must price every lot too',
          await nextDisabled(),
        );

        // Buyers price lots 1 and 2 but not 3.
        const buyerRows = await page.$$('#entry-body .team-b .entry-row');
        for (const row of buyerRows) {
          const ins = await row.$$('input');
          await ins[0].fill('600');
          await ins[1].fill('700');
        }
        report.check('a lot with no buyer price still blocks the results', await nextDisabled());

        for (const row of buyerRows) await (await row.$$('input'))[2].fill('800');
        report.check(
          'once both sides priced every lot the results unlock',
          !(await nextDisabled()),
        );

        await page.click('#next-btn');
        await page.waitForTimeout(500);
        const lotRows = await page.$$eval('#results-tbody tr', (els) =>
          els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
        );
        report.check(
          'the results table has one row per lot',
          lotRows.length === 3,
          lotRows.join(' | '),
        );
        report.check(
          'the lot rows are Кружка, Автомобиль, Дом in order',
          lotRows[0].startsWith('Кружка') &&
            lotRows[1].startsWith('Автомобиль') &&
            lotRows[2].startsWith('Дом'),
        );
        report.check(
          'lot 1 gap is asking 1000 ÷ offering 600 = 1.7×',
          lotRows[0].includes('1.7×'),
          lotRows[0],
        );
        report.check('lot 3 gap is 1000 ÷ 800 = 1.3×', lotRows[2].includes('1.3×'), lotRows[2]);
        const participants = await page.$$eval('#participants-tbody tr', (els) => els.length);
        report.check(
          'the per-person table lists everyone with their role',
          participants === people,
          `${participants} vs ${people}`,
        );
        const headline = await page.textContent('.reveal .n');
        report.check(
          'the headline is the average ratio across the lots',
          /^\d\.\d×$/.test(headline.trim()),
          headline.trim(),
        );
        const verdict = await page.textContent('.reveal-verdict');
        report.check(
          'the team verdict lists the ratio for each lot',
          ['Кружка', 'Автомобиль', 'Дом'].every((n) => verdict.includes(n)),
          verdict.trim().slice(0, 100),
        );

        const exported = await page.evaluate(() => window.__reportData);
        report.check(
          'the export report mentions the three lots',
          !!exported && exported.meta.extra.includes('3 лота'),
          JSON.stringify(exported?.meta),
        );
      } catch (e) {
        report.fail('entry/results: threw', e.message);
      }
      await page.close();
    }

    // --- drafts saved by the old two-round version must not crash the new game ---
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
          const entries = names.map((name) => ({
            name,
            r1Role: 'owner',
            r2Role: 'buyer',
            r1Price: 100,
            r2Price: 50,
          }));
          sessionStorage.setItem(
            'retro-draft-endowment',
            JSON.stringify({
              payload: { groups: { groupA: names, groupB: [] }, entries },
              savedAt: Date.now(),
            }),
          );
        });
        await openGameFromHome(page, 'endowment');
        await page.waitForTimeout(200);
        report.check(
          'an old-format draft is ignored (no restore banner, no crash)',
          !(await page.isVisible('.draft-banner')),
        );
        report.check(
          'the game still starts normally',
          await page.isVisible('button:has-text("Распределить группы")'),
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
