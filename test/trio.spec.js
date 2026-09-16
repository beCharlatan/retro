// test/trio.spec.js
// With an odd number of participants, pair games (Ultimatum,
// Prisoner's Dilemma) used to leave one person out as a silent
// "observer". Roles.makePairs now forms a trio instead — three
// people play a rotating triangle (p1↔p2, p2↔p3, p3↔p1) so everyone
// gets real turns, just via two different partners instead of one.
// This locks in: nobody is ever excluded, the trio note names the
// right three people, every trio member appears in exactly two of
// the three triangle matches (once on each side), and both games
// still compute complete results including the trio's rows.
//
// Expected pair/card counts are derived from the ACTUAL participant
// count read off the page rather than hardcoded, so this suite keeps
// working regardless of how many people are in the default roster.

const { Report, openPage, withBrowser, openGameFromHome } = require('./lib');

// The roster HUD panel is collapsed by default on the map (see
// home.js) and now animates open/closed (a CSS grid-rows transition,
// not an instant DOM swap) — .panel-head/.count are always in the DOM,
// just collapsed to zero height until expanded. Checking THAT
// (.panel-head .count's visibility) to decide whether to click the
// toggle is exactly what broke here: mid-transition it can read as
// "not visible yet" even though the toggle was already clicked, so a
// second call would click AGAIN and close what it just opened. Check
// the panel's own stable `.open` class instead — an instant attribute,
// not something a transition leaves ambiguous for a frame — and wait
// past the transition's duration (320ms in map-styles.css) before
// treating it as settled.
async function currentCount(page) {
  const isOpen = await page
    .$eval('.roster-panel', (el) => el.classList.contains('open'))
    .catch(() => false);
  if (!isOpen) {
    await page.click('.roster-toggle');
    await page.waitForTimeout(400);
  }
  const text = await page.textContent('.panel-head .count');
  return parseInt(text, 10);
}

// Removes participants one at a time until the count's parity matches
// `wantOdd`, so this works no matter what the default roster's size is.
async function ensureParity(page, wantOdd) {
  let count = await currentCount(page);
  while ((count % 2 === 1) !== wantOdd) {
    await page.click('.chip-x');
    await page.waitForTimeout(80);
    count = await currentCount(page);
  }
  return count;
}

async function run() {
  const report = new Report();
  report.section('Trio fallback for odd participant counts');

  await withBrowser(async (browser) => {
    // --- Ultimatum ---
    {
      const page = await openPage(browser, report);
      const n = await ensureParity(page, true);
      report.check(`Ultimatum: participant count is odd (${n})`, n % 2 === 1);
      const expectedCards = (n - 3) / 2 + 3; // regular disjoint pairs + the trio's 3 matches
      const expectedInputs = expectedCards * 2;

      await openGameFromHome(page, 'ultimatum');
      await page.click('button:has-text("Распределить пары")');
      await page.waitForTimeout(120);

      const totalCards = await page.$$eval('.role-pair-card', (els) => els.length);
      report.check(
        `Ultimatum: ${n} people -> ${expectedCards} pair-cards`,
        totalCards === expectedCards,
        `got ${totalCards}`,
      );

      const trioCards = await page.$$eval('.role-pair-card.role-pair-trio', (els) => els.length);
      report.check(
        'Ultimatum: exactly 3 cards flagged as trio',
        trioCards === 3,
        `got ${trioCards}`,
      );

      const noteVisible = await page.isVisible('.info-tip >> text=трио').catch(() => false);
      report.check('Ultimatum: trio explanation note is shown', noteVisible);

      // Every trio member should appear as proposer exactly once and
      // responder exactly once across the trio's three cards.
      const trioNames = await page.$$eval('.role-pair-card.role-pair-trio .role-pair-name', (els) =>
        els.map((e) => e.textContent.trim()),
      );
      const counts = {};
      trioNames.forEach((name) => {
        counts[name] = (counts[name] || 0) + 1;
      });
      const everyoneAppearsTwice =
        Object.values(counts).length === 3 && Object.values(counts).every((c) => c === 2);
      report.check(
        'Ultimatum: each trio member appears exactly twice (once per side)',
        everyoneAppearsTwice,
        JSON.stringify(counts),
      );

      await page.click('button:has-text("Дальше")');
      await page.waitForTimeout(120);
      const roundInputs = await page.$$('#entry-body-1 input');
      report.check(
        `Ultimatum: round 1 has ${expectedInputs} inputs (${expectedCards} pairs × 2 fields)`,
        roundInputs.length === expectedInputs,
        `got ${roundInputs.length}`,
      );
      for (let i = 0; i < roundInputs.length; i += 2) {
        await roundInputs[i].fill('400');
        await roundInputs[i + 1].fill('300');
      }
      await page.click('#next-btn-1');
      await page.waitForTimeout(100);
      const round2Inputs = await page.$$('#entry-body-2 input');
      report.check(
        `Ultimatum: round 2 also covers all ${expectedCards} pairs (trio included)`,
        round2Inputs.length === expectedInputs,
        `got ${round2Inputs.length}`,
      );
      for (let i = 0; i < round2Inputs.length; i += 2) {
        await round2Inputs[i].fill('350');
        await round2Inputs[i + 1].fill('280');
      }
      await page.click('#next-btn-2');
      await page.waitForTimeout(150);
      const resultRows = await page.$$eval('#results-tbody tr', (els) => els.length);
      report.check(
        `Ultimatum: results table has all ${expectedInputs} rows (nobody dropped)`,
        resultRows === expectedInputs,
        `got ${resultRows}`,
      );

      await page.close();
    }

    // --- Prisoner's Dilemma ---
    {
      const page = await openPage(browser, report);
      const n = await ensureParity(page, true);
      const expectedCards = (n - 3) / 2 + 3;

      await openGameFromHome(page, 'prisoners-dilemma');
      await page.click('button:has-text("Распределить пары")');
      await page.waitForTimeout(120);

      const trioCards = await page.$$eval('.role-pair-card.role-pair-trio', (els) => els.length);
      report.check(
        `Prisoner's Dilemma: exactly 3 trio cards for ${n} people`,
        trioCards === 3,
        `got ${trioCards}`,
      );

      await page.click('button:has-text("Дальше")');
      await page.waitForTimeout(120);
      const cards1 = await page.$$('#entry-body-1 .pair-entry-card');
      report.check(
        `Prisoner's Dilemma: round 1 has ${expectedCards} pair-entry cards`,
        cards1.length === expectedCards,
        `got ${cards1.length}`,
      );
      for (const c of cards1) {
        const toggles = await c.$$('.toggle-pair');
        await (await toggles[0].$('button[data-val="C"]')).click();
        await (await toggles[1].$('button[data-val="D"]')).click();
      }
      await page.click('#next-btn-1');
      await page.waitForTimeout(120);
      const recapRows = await page.$$eval('#recap-tbody tr', (els) => els.length);
      report.check(
        `Prisoner's Dilemma: recap lists all ${expectedCards} matches`,
        recapRows === expectedCards,
        `got ${recapRows}`,
      );

      await page.click('button:has-text("Раунд 2")');
      await page.waitForTimeout(120);
      const cards2 = await page.$$('#entry-body-2 .pair-entry-card');
      report.check(
        `Prisoner's Dilemma: round 2 also has all ${expectedCards} matches`,
        cards2.length === expectedCards,
        `got ${cards2.length}`,
      );
      for (const c of cards2) {
        const toggles = await c.$$('.toggle-pair');
        await (await toggles[0].$('button[data-val="C"]')).click();
        await (await toggles[1].$('button[data-val="C"]')).click();
      }
      await page.click('#next-btn-2');
      await page.waitForTimeout(150);
      const resultRows = await page.$$eval('#results-tbody tr', (els) => els.length);
      report.check(
        `Prisoner's Dilemma: results include all ${expectedCards * 2} rows (${expectedCards} matches × 2 rounds)`,
        resultRows === expectedCards * 2,
        `got ${resultRows}`,
      );

      await page.close();
    }

    // --- control: even count still uses plain pairs, no trio ---
    {
      const page = await openPage(browser, report);
      const n = await ensureParity(page, false);
      const expectedCards = n / 2;

      await openGameFromHome(page, 'ultimatum');
      await page.click('button:has-text("Распределить пары")');
      await page.waitForTimeout(120);
      const trioCards = await page.$$eval('.role-pair-card.role-pair-trio', (els) => els.length);
      report.check(
        `Control: even participant count (${n}) produces zero trio cards`,
        trioCards === 0,
        `got ${trioCards}`,
      );
      const totalCards = await page.$$eval('.role-pair-card', (els) => els.length);
      report.check(
        `Control: even count (${n}) makes exactly ${expectedCards} plain pairs`,
        totalCards === expectedCards,
        `got ${totalCards}`,
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
