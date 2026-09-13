// test/chart-tip.spec.js
// Three games draw scatter charts with one dot per person: anchoring
// (already labels dots with names), crowd-wisdom and dictator (which
// don't — too many overlapping dots for permanent labels to stay
// legible). ChartTip gives every dot a hover tooltip naming who it
// belongs to and what they answered, via an invisible larger hit
// circle layered over the small visible one (a 5-6px dot is a fiddly
// mouse target on its own). Locks in: the tooltip shows the right
// person + value, hides again when the mouse leaves, and the
// dictator chart's two rounds (different colours) resolve to two
// distinct hoverable points with the right per-round label.
//
// Note: results screens use Screen.goTo(), which triggers a smooth
// scroll — tests wait for that to settle before measuring element
// positions, otherwise a hover computed against a pre-scroll
// coordinate lands on the wrong pixel once the page finishes moving.

const { Report, openPage, withBrowser } = require('./lib');

async function hoverHitCircle(page, chartSelector) {
  await page.waitForTimeout(700); // let the results screen's smooth-scroll settle
  const circles = await page.$$(chartSelector);
  const hit = circles[1]; // [0] = small visible dot, [1] = its larger invisible hit target
  const box = await hit.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 3 });
  await page.waitForTimeout(150);
}

async function run() {
  const report = new Report();
  report.section('Chart hover tooltips');

  await withBrowser(async (browser) => {
    // --- anchoring ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Эффект якоря');
      await page.click('button:has-text("Вносить данные")');
      const inputs = await page.$$('[data-testid="entry-body"] input');
      const vals = [
        12, 20, 88, 50, 45, 35, 30, 25, 67, 42, 19, 22, 5, 15, 72, 48, 55, 38, 40, 29, 60, 40, 25,
        30, 33, 33,
      ];
      for (let i = 0; i < inputs.length; i++) await inputs[i].fill(String(vals[i]));
      await page.click('button:has-text("Показать результаты")');

      const noTooltipYet = await page.isVisible('.chart-tooltip.visible').catch(() => false);
      report.check('anchoring: no tooltip visible before hovering anything', !noTooltipYet);

      await hoverHitCircle(page, '#scatter circle');
      const visible = await page.isVisible('.chart-tooltip.visible');
      report.check('anchoring: tooltip appears on hover', visible);
      const html = await page.innerHTML('.chart-tooltip');
      report.check(
        'anchoring: tooltip names the right person and shows both values',
        html.includes('Михаил') && html.includes('12') && html.includes('20%'),
        html.replace(/\s+/g, ' '),
      );

      await page.mouse.move(5, 5);
      await page.waitForTimeout(200);
      const hiddenAfter = await page.isVisible('.chart-tooltip.visible').catch(() => false);
      report.check('anchoring: tooltip hides once the mouse leaves the dot', !hiddenAfter);

      await page.close();
    }

    // --- crowd-wisdom: no permanent labels on this chart, so the tooltip is the only way to know whose dot is whose ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Мудрость толпы');
      await page.click('button:has-text("Вносить данные")');
      const inputs = await page.$$('#entry-body input');
      for (let i = 0; i < inputs.length; i++) await inputs[i].fill(String(300 + i * 30));
      await page.click('button:has-text("Показать результаты")');

      await hoverHitCircle(page, '#cw-chart circle');
      const html = await page.innerHTML('.chart-tooltip');
      report.check(
        'crowd-wisdom: tooltip shows a name and the guessed value',
        html.includes('Михаил') && html.includes('300'),
        html.replace(/\s+/g, ' '),
      );

      await page.close();
    }

    // --- dictator: two dots per person (round 1 / round 2) must resolve to two distinct, correctly-labelled tooltips ---
    {
      const page = await openPage(browser, report);
      await page.click('text=Игра диктатора');
      await page.click('button:has-text("Раунд 1")');
      // data-testid, not id — dictator is a Shadow DOM Lit component
      // (docs/modernization-plan.md Phase 2); Playwright's CSS engine
      // pierces open shadow roots for these the same as for ids/classes.
      const r1 = await page.$$('[data-testid="entry-body-1"] input');
      for (let i = 0; i < r1.length; i++) await r1[i].fill(String(100 + i * 20));
      await page.click('[data-testid="next-btn-1"]');
      await page.waitForTimeout(100);
      const r2 = await page.$$('[data-testid="entry-body-2"] input');
      for (let i = 0; i < r2.length; i++) await r2[i].fill(String(150 + i * 20));
      await page.click('[data-testid="next-btn-2"]');

      await hoverHitCircle(page, '#dict-chart circle');
      const html1 = await page.innerHTML('.chart-tooltip');
      report.check(
        'dictator: round-1 dot tooltip is labelled as round 1 with the round-1 value',
        html1.includes('Раунд 1') && html1.includes('100'),
        html1.replace(/\s+/g, ' '),
      );

      // The 3rd/4th circles in DOM order are person 2's round-1 pair
      // (visible+hit); circles 2/3 (0-indexed) belong to the SAME
      // person's round-2 dot — hover that one and confirm it's
      // correctly labelled round 2 instead.
      await page.waitForTimeout(300);
      const allCircles = await page.$$('#dict-chart circle');
      const round2Hit = allCircles[3];
      const box2 = await round2Hit.boundingBox();
      await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 3 });
      await page.waitForTimeout(150);
      const html2 = await page.innerHTML('.chart-tooltip');
      report.check(
        'dictator: a different dot is labelled as round 2 with the round-2 value',
        html2.includes('Раунд 2') && html2.includes('150'),
        html2.replace(/\s+/g, ' '),
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
