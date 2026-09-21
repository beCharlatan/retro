// test/map-layout.spec.js
// The home map must fit whatever window it is opened in:
//  - every icon (with its glow) stays inside the viewport, also on small or
//    zoomed-in windows and right after the window is resized;
//  - the decorative canvas (motion trails + drifting dots) is exactly the
//    size of the map — on a Retina screen (deviceScaleFactor 2) it used to be
//    laid out at 2× and draw every trail far from its icon, partly off-screen.

const path = require('node:path');
const { Report, withBrowser } = require('./lib');

const URL = `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;
const GLOW = 18; // px of drop-shadow reach around an icon

const SIZES = [
  [1920, 1080],
  [1440, 800],
  [1280, 500],
  [1000, 420],
  [900, 360],
];

const measure = (page) =>
  page.evaluate((glow) => {
    const deep = (root, sel, out = []) => {
      root.querySelectorAll(sel).forEach((e) => {
        out.push(e);
      });
      root.querySelectorAll('*').forEach((e) => {
        if (e.shadowRoot) deep(e.shadowRoot, sel, out);
      });
      return out;
    };
    const icons = deep(document, 'button.location');
    let outside = 0;
    for (const b of icons) {
      const r = b.querySelector('img').getBoundingClientRect();
      if (
        r.left - glow < 0 ||
        r.top - glow < 0 ||
        r.right + glow > innerWidth ||
        r.bottom + glow > innerHeight
      )
        outside++;
    }
    const canvas = deep(document, 'canvas.map-fx-canvas')[0];
    const c = canvas.getBoundingClientRect();
    const host = icons[0].getRootNode().host.getBoundingClientRect();
    return {
      count: icons.length,
      outside,
      canvas: [Math.round(c.width), Math.round(c.height)],
      host: [Math.round(host.width), Math.round(host.height)],
      pageScrolls:
        document.documentElement.scrollHeight > innerHeight ||
        document.documentElement.scrollWidth > innerWidth,
    };
  }, GLOW);

async function run() {
  const report = new Report();
  report.section('Home map — fits the window, canvas matches the map');

  await withBrowser(async (browser) => {
    for (const [w, h] of SIZES) {
      for (const motion of ['no-preference', 'reduce']) {
        const ctx = await browser.newContext({
          viewport: { width: w, height: h },
          reducedMotion: motion,
        });
        const page = await ctx.newPage();
        page.on('pageerror', (e) => report.fail('no uncaught JS errors', String(e)));
        await page.goto(URL);
        await page.waitForTimeout(motion === 'reduce' ? 700 : 4200);
        const m = await measure(page);
        const label = `${w}×${h}${motion === 'reduce' ? ' (reduced motion)' : ''}`;
        report.check(`${label}: all 13 game icons are on the map`, m.count === 13);
        report.check(
          `${label}: every icon and its glow is inside the window`,
          m.outside === 0,
          `${m.outside} outside`,
        );
        report.check(`${label}: the page does not need scrolling`, !m.pageScrolls);
        report.check(
          `${label}: trail canvas is exactly the size of the map`,
          m.canvas[0] === m.host[0] && m.canvas[1] === m.host[1],
          `canvas ${m.canvas} vs map ${m.host}`,
        );
        await ctx.close();
      }
    }

    // Retina: the canvas' backing store is 2×, its on-screen size must not be.
    {
      const ctx = await browser.newContext({
        viewport: { width: 1200, height: 700 },
        deviceScaleFactor: 2,
        reducedMotion: 'no-preference',
      });
      const page = await ctx.newPage();
      await page.goto(URL);
      await page.waitForTimeout(3500);
      const m = await measure(page);
      const backing = await page.evaluate(() => {
        const deep = (root, sel, out = []) => {
          root.querySelectorAll(sel).forEach((e) => {
            out.push(e);
          });
          root.querySelectorAll('*').forEach((e) => {
            if (e.shadowRoot) deep(e.shadowRoot, sel, out);
          });
          return out;
        };
        const c = deep(document, 'canvas.map-fx-canvas')[0];
        return [c.width, c.height];
      });
      report.check(
        'Retina (dpr 2): canvas on-screen size equals the map, not 2× the map',
        m.canvas[0] === 1200 && m.canvas[1] === 700,
        `canvas ${m.canvas}`,
      );
      report.check(
        'Retina (dpr 2): the backing store is still sharp (2×)',
        backing[0] === 2400 && backing[1] === 1400,
        `backing ${backing}`,
      );
      await ctx.close();
    }

    // The motion wake (tail behind each icon) is actually visible: coloured
    // canvas pixels exist OUTSIDE the icon's own body, in a ring around it. (It
    // used to be drawn from the icon's last few positions — ~2px apart — and sat
    // entirely underneath the icon.)
    {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 800 },
        reducedMotion: 'no-preference',
      });
      const page = await ctx.newPage();
      await page.goto(URL);
      await page.waitForTimeout(4200);
      const wake = await page.evaluate(() => {
        const deep = (root, sel, out = []) => {
          root.querySelectorAll(sel).forEach((e) => {
            out.push(e);
          });
          root.querySelectorAll('*').forEach((e) => {
            if (e.shadowRoot) deep(e.shadowRoot, sel, out);
          });
          return out;
        };
        const canvas = deep(document, 'canvas.map-fx-canvas')[0];
        const c = canvas.getContext('2d');
        const cr = canvas.getBoundingClientRect();
        const data = c.getImageData(0, 0, canvas.width, canvas.height);
        const sx = canvas.width / cr.width;
        let withWake = 0;
        const icons = deep(document, 'button.location');
        for (const b of icons) {
          const r = b.querySelector('img').getBoundingClientRect();
          const cx = r.left + r.width / 2 - cr.left;
          const cy = r.top + r.height / 2 - cr.top;
          let coloured = 0;
          for (let ang = 0; ang < 360; ang += 6) {
            for (let dist = 46; dist <= 120; dist += 4) {
              const x = Math.round((cx + Math.cos((ang * Math.PI) / 180) * dist) * sx);
              const y = Math.round((cy + Math.sin((ang * Math.PI) / 180) * dist) * sx);
              if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
              const i = (y * canvas.width + x) * 4;
              const [R, G, B, A] = [
                data.data[i],
                data.data[i + 1],
                data.data[i + 2],
                data.data[i + 3],
              ];
              // wake dots are tinted (not the white ambient dots) and clearly non-transparent
              if (A > 25 && Math.min(R, G, B) < 235) coloured++;
            }
          }
          if (coloured >= 6) withWake++;
        }
        return { withWake, total: icons.length };
      });
      report.check(
        'the motion wake is visible outside the icons (coloured tail pixels around most icons)',
        wake.withWake >= 9,
        `${wake.withWake} of ${wake.total} icons have a visible tail`,
      );
      await ctx.close();
    }

    // Live resize: shrink the window, then grow it back.
    for (const motion of ['no-preference', 'reduce']) {
      const ctx = await browser.newContext({
        viewport: { width: 1440, height: 800 },
        reducedMotion: motion,
      });
      const page = await ctx.newPage();
      await page.goto(URL);
      await page.waitForTimeout(motion === 'reduce' ? 700 : 3000);
      await page.setViewportSize({ width: 900, height: 400 });
      await page.waitForTimeout(700);
      let m = await measure(page);
      const tag = motion === 'reduce' ? ' (reduced motion)' : '';
      report.check(
        `resize 1440×800 → 900×400${tag}: icons are pulled back inside`,
        m.outside === 0,
        `${m.outside} outside`,
      );
      report.check(
        `resize → 900×400${tag}: canvas follows the map`,
        m.canvas[0] === m.host[0] && m.canvas[1] === m.host[1],
        `canvas ${m.canvas} vs map ${m.host}`,
      );
      await page.setViewportSize({ width: 1440, height: 800 });
      await page.waitForTimeout(700);
      m = await measure(page);
      report.check(
        `resize back to 1440×800${tag}: still inside, canvas follows`,
        m.outside === 0 && m.canvas[0] === m.host[0],
        `${m.outside} outside`,
      );
      await ctx.close();
    }
  });

  return report;
}

module.exports = { run };

if (require.main === module) {
  run().then((r) => process.exit(r.summary() ? 0 : 1));
}
