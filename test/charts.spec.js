// test/charts.spec.js
// The nine games that got a results chart in the "charts for the rest" pass:
// Общественное благо, Ложный консенсус, Эффект Барнума, Эвристика доступности,
// Ошибка планирования, Калибровка, Эффект владения, Дилемма заключённого,
// Ультиматум. (Якорь, Мудрость толпы, Диктатор и Фрейминг already had one —
// see chart-tip.spec.js.) For each: the chart is drawn with one mark per data
// point, fits its card, has a caption and an accessible label, shows a tooltip
// naming the right thing on hover, and throws no errors.

const { Report, openPage, withBrowser, openGameFromHome } = require('./lib');
const { GAMES } = require('./games');

const DEEP = `const deep=(r,s,o=[])=>{r.querySelectorAll(s).forEach(e=>{o.push(e)});r.querySelectorAll('*').forEach(e=>{if(e.shadowRoot)deep(e.shadowRoot,s,o)});return o};`;

// game id → chart id, what one "mark" is (a selector inside the svg), and how many
// to expect given `people` participants (and, for tooltip checks, a substring the
// first tooltip should contain).
const CHARTS = [
  {
    game: 'public-goods',
    svg: 'pg-chart',
    mark: '.answer-dot',
    expect: (n) => 2 * n,
    tip: 'Раунд 2',
  },
  { game: 'false-consensus', svg: 'fc-chart', mark: '.answer-dot', expect: (n) => n, tip: 'Ждал' },
  { game: 'barnum', svg: 'barnum-chart', mark: '.answer-dot', expect: (n) => n, tip: 'из 5' },
  {
    game: 'availability',
    svg: 'av-chart',
    mark: '.chart-bar',
    expect: () => 4,
    tip: 'Верно',
    hitTag: 'rect',
  },
  {
    game: 'planning-fallacy',
    svg: 'pf-chart',
    mark: '.answer-dot',
    expect: (n) => n,
    tip: 'Во сколько раз дольше',
  },
  {
    game: 'calibration',
    svg: 'cal-chart',
    mark: '.interval-bar',
    expect: null,
    tip: 'Диапазон',
    hitTag: 'rect',
  },
  { game: 'endowment', svg: 'end-chart', mark: '.answer-dot', expect: (n) => 3 * n, tip: 'Роль' },
  {
    game: 'prisoners-dilemma',
    svg: 'pd-chart',
    mark: '.chart-bar',
    expect: null,
    tip: 'пар',
    hitTag: 'rect',
  },
  { game: 'ultimatum', svg: 'ult-chart', mark: '.answer-dot', expect: null, tip: 'Итог' },
];

async function run() {
  const report = new Report();
  report.section('Results charts — the nine games added in the charts pass');

  await withBrowser(async (browser) => {
    for (const c of CHARTS) {
      const page = await openPage(browser, report);
      const label = GAMES.find((g) => g.id === c.game).name;
      try {
        await openGameFromHome(page, c.game);
        await page.waitForTimeout(100);
        const game = GAMES.find((g) => g.id === c.game);
        await game.toEntryScreen(page);
        await page.waitForTimeout(80);
        const people = await game.fill(page, {});
        await game.toResults(page);
        await page.waitForTimeout(900);

        const info = await page.evaluate(
          ({ deepSrc, svgId, mark }) => {
            // eslint-disable-next-line no-new-func
            const deep = new Function(`${deepSrc} return deep;`)();
            const svg = deep(document, `#${svgId}`)[0];
            if (!svg) return null;
            const card = svg.closest('.d3-chart-card');
            const cardBox = card.getBoundingClientRect();
            const svgBox = svg.getBoundingClientRect();
            const vb = svg.getAttribute('viewBox').split(' ').map(Number);
            return {
              marks: svg.querySelectorAll(mark).length,
              cardTitle: card.querySelector('.d3-chart-title')?.textContent.trim() ?? '',
              caption: card.querySelector('.d3-chart-cap')?.textContent.trim() ?? '',
              ariaLabel: svg.getAttribute('aria-label') || '',
              role: svg.getAttribute('role'),
              fits: svgBox.width <= cardBox.width + 1 && svgBox.height > 40,
              viewBoxHeight: vb[3],
              texts: [...svg.querySelectorAll('text')].map((t) => t.textContent).join('|'),
            };
          },
          { deepSrc: DEEP, svgId: c.svg, mark: c.mark },
        );

        report.check(`${label}: a chart is drawn`, !!info);
        if (!info) {
          await page.close();
          continue;
        }
        if (c.expect)
          report.check(
            `${label}: one mark per data point`,
            info.marks === c.expect(people),
            `${info.marks} vs ${c.expect(people)}`,
          );
        else report.check(`${label}: the chart has marks`, info.marks > 0, `${info.marks}`);
        report.check(`${label}: the chart fits its card`, info.fits);
        report.check(
          `${label}: it has a title, a caption and an accessible label`,
          info.cardTitle.length > 5 &&
            info.caption.length > 30 &&
            info.ariaLabel.length > 10 &&
            info.role === 'img',
        );
        report.check(
          `${label}: no NaN or undefined leaked into the labels`,
          !/NaN|undefined|Infinity/.test(info.texts),
          info.texts.slice(0, 80),
        );
        report.check(
          `${label}: the height follows the data (not a fixed tall box)`,
          info.viewBoxHeight > 40 && info.viewBoxHeight < 1100,
          `viewBox height ${info.viewBoxHeight}`,
        );

        // Hover the first interactive mark: a tooltip must appear and say something specific.
        await page.evaluate(
          ({ deepSrc, svgId, mark, hitTag }) => {
            // eslint-disable-next-line no-new-func
            const deep = new Function(`${deepSrc} return deep;`)();
            const svg = deep(document, `#${svgId}`)[0];
            const first = svg.querySelector(mark);
            const hit =
              hitTag === 'rect'
                ? [...svg.querySelectorAll('rect')].find(
                    (r) => r.getAttribute('fill') === 'transparent',
                  )
                : first.nextElementSibling;
            hit.dispatchEvent(
              new MouseEvent('mouseenter', { bubbles: true, clientX: 200, clientY: 200 }),
            );
          },
          { deepSrc: DEEP, svgId: c.svg, mark: c.mark, hitTag: c.hitTag },
        );
        await page.waitForTimeout(80);
        const tip = await page.evaluate(
          () => document.querySelector('.chart-tooltip.visible')?.textContent ?? '',
        );
        report.check(
          `${label}: hovering a mark shows a tooltip with “${c.tip}”`,
          tip.includes(c.tip),
          tip.replace(/\s+/g, ' ').slice(0, 90),
        );
      } catch (e) {
        report.fail(`${label}: threw while checking the chart`, e.message);
      }
      await page.close();
    }

    // Calibration / dilemma / ultimatum have data-dependent mark counts: check them against
    // known input instead.
    {
      const page = await openPage(browser, report);
      try {
        await openGameFromHome(page, 'ultimatum');
        const game = GAMES.find((g) => g.id === 'ultimatum');
        await game.toEntryScreen(page);
        await game.fill(page, {});
        await game.toResults(page);
        await page.waitForTimeout(800);
        const dots = await page.$$eval('#ult-chart .answer-dot', (els) => els.length);
        const rows = await page.$$eval('#results-tbody tr', (els) => els.length);
        report.check(
          'Ультиматум: one dot per proposal (= rows of the results table)',
          dots === rows && rows > 0,
          `${dots} vs ${rows}`,
        );
        const legend = await page.textContent('#ult-chart');
        report.check(
          'Ультиматум: legend and guide line are labelled',
          legend.includes('сделка') &&
            legend.includes('отказ') &&
            legend.includes('предложение = минимум'),
        );
      } catch (e) {
        report.fail('ultimatum data check: threw', e.message);
      }
      await page.close();
    }
    {
      const page = await openPage(browser, report);
      try {
        await openGameFromHome(page, 'calibration');
        const game = GAMES.find((g) => g.id === 'calibration');
        await game.toEntryScreen(page);
        const people = await game.fill(page, {});
        await game.toResults(page);
        await page.waitForTimeout(800);
        const bars = await page.$$eval('#cal-chart .interval-bar', (els) => els.length);
        const lanes = await page.$$eval(
          '#cal-chart text',
          (els) => els.filter((t) => t.textContent.startsWith('верный ответ')).length,
        );
        report.check(
          'Калибровка: a lane per question (4) with its true answer marked',
          lanes === 4,
          `${lanes} lanes`,
        );
        report.check(
          'Калибровка: bars for the people who answered (at most people × 4)',
          bars > 0 && bars <= people * 4,
          `${bars} bars for ${people} people`,
        );
        const answers = await page.textContent('#cal-chart');
        report.check(
          'Калибровка: every lane shows its true answer with unit',
          ['3 422 °C', '1 071', '78 хромосом', '3 812 м'].every((a) =>
            answers.replace(/ /g, ' ').includes(a),
          ),
          answers.slice(0, 120),
        );
      } catch (e) {
        report.fail('calibration data check: threw', e.message);
      }
      await page.close();
    }
    {
      const page = await openPage(browser, report);
      try {
        await openGameFromHome(page, 'prisoners-dilemma');
        const game = GAMES.find((g) => g.id === 'prisoners-dilemma');
        await game.toEntryScreen(page);
        await game.fill(page, {});
        await game.toResults(page);
        await page.waitForTimeout(800);
        const rows = await page.$$eval('#pd-chart text', (els) => els.map((t) => t.textContent));
        report.check(
          'Дилемма: one row per round and a legend with the three outcomes',
          rows.includes('Раунд 1') &&
            rows.includes('Раунд 2') &&
            rows.includes('оба сотрудничали') &&
            rows.includes('одного предали') &&
            rows.includes('оба предали'),
          rows.join('|'),
        );
      } catch (e) {
        report.fail('dilemma data check: threw', e.message);
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
