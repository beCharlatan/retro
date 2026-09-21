// test/a11y.spec.js
// Accessibility: axe-core (WCAG 2.x A/AA + best practices) on the map and on
// every game's intro, entry and results screens, plus the keyboard details axe
// can't see — focus in and out of the exit dialog, a visible focus ring, and a
// name on every entry field.

const AxeBuilder = require('@axe-core/playwright').default;
const { Report, openPage, withBrowser, openGameFromHome } = require('./lib');
const { GAMES } = require('./games');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const SETTLE_MS = 450; // buttons and cards fade between states; axe would read half-blended colours

async function violations(page) {
  await page.waitForTimeout(SETTLE_MS);
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id}: ${n.target.join(' ').slice(0, 80)}`),
  );
}

async function checkScreen(report, page, label) {
  const found = await violations(page);
  report.check(`${label}: no axe violations`, found.length === 0, found.slice(0, 4).join(' | '));
}

// Every visible entry field must have an accessible name (aria-label or <label>).
async function unnamedInputs(page) {
  return page.evaluate(() => {
    const out = [];
    const walk = (root) => {
      for (const el of root.querySelectorAll('input, select, textarea')) {
        if (el.offsetParent === null) continue;
        const named =
          el.getAttribute('aria-label') ||
          el.getAttribute('aria-labelledby') ||
          el.labels?.length ||
          el.closest('label');
        if (!named) out.push(el.outerHTML.slice(0, 80));
      }
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
    };
    walk(document);
    return out;
  });
}

async function run() {
  const report = new Report();

  await withBrowser(async (browser) => {
    report.section('Accessibility — map');
    {
      const page = await openPage(browser, report);
      try {
        await checkScreen(report, page, 'home');
      } finally {
        await page.close();
      }
    }

    for (const game of GAMES) {
      report.section(`Accessibility — ${game.name}`);
      const page = await openPage(browser, report);
      try {
        await openGameFromHome(page, game.id);
        await checkScreen(report, page, 'intro');

        await game.toEntryScreen(page);
        await page.waitForTimeout(250);
        await game.fill(page, {});
        await checkScreen(report, page, 'entry');
        const unnamed = await unnamedInputs(page);
        report.check(
          'every entry field has a name',
          unnamed.length === 0,
          unnamed.slice(0, 2).join(' | '),
        );

        await game.toResults(page);
        await page.waitForTimeout(600);
        await checkScreen(report, page, 'results');
      } catch (e) {
        report.fail(`${game.name}: a11y walkthrough`, String(e).split('\n')[0]);
      } finally {
        await page.close();
      }
    }

    report.section('Accessibility — keyboard');
    const page = await openPage(browser, report);
    try {
      await openGameFromHome(page, 'anchoring');
      await page.waitForTimeout(150);

      // The exit dialog: opens on the safe button, Escape puts focus back on ×.
      await page.click('.game-exit');
      await checkScreen(report, page, 'exit dialog');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(80);
      report.check(
        'Escape returns focus to the × that opened the dialog',
        await page.evaluate(() => {
          let el = document.activeElement;
          while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
          return el?.classList.contains('game-exit');
        }),
      );

      // Tabbing lands on real controls and each shows a focus ring.
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        let el = document.activeElement;
        while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
        const s = getComputedStyle(el);
        return { tag: el.tagName, width: parseFloat(s.outlineWidth), style: s.outlineStyle };
      });
      report.check(
        'a keyboard-focused control shows an outline',
        ring.style !== 'none' && ring.width >= 2,
        JSON.stringify(ring),
      );
    } finally {
      await page.close();
    }
  });

  return report;
}

module.exports = { run };

if (require.main === module) {
  run().then((r) => process.exit(r.summary() ? 0 : 1));
}
