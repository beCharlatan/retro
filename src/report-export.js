/* =========================================================
   SHARED PATTERN: export the results screen as a PNG report
   =========================================================
   Replaces the old window.print() / @media print pipeline — that one
   depended on the browser's print dialog, page-break heuristics and a
   second "print-only" copy of the layout, and looked like a stripped-
   down form. This one renders a purpose-built, branded report card
   OFF-SCREEN in the light DOM and rasterizes it to a PNG with
   html-to-image, so the file looks the same everywhere and the person
   just gets a download — no dialog.

   The report is not a second implementation of each game's results:
   the body is a CLONE of the results screen's own content (reveal,
   stats, charts, group comparison, table), so it keeps the exact
   design language the app already has (styles.css is a normal
   document stylesheet, so the clones pick it up in the light DOM).
   Only the frame is new — branded header with the game's 3D icon
   and accent, a meta card (participants / format / time / date) and
   a "Что это было" explainer.

   USAGE (inside a Lit component's _showResults()):

     ReportExport.register('anchoring', {
       subtitle: 'Случайное число незаметно сдвигает вашу же оценку.',
       meta: ReportExport.meta(filled.length),          // or (n, 'extra')
       explanation: 'Случайное число, увиденное прямо перед оценкой …',
     }, this.renderRoot);

   and in the results template, after the table:

     <button class="ghost" id="export-btn"
       @click=${(e) => ReportExport.download(e.currentTarget)}>
       ${unsafeHTML(ICON_DOWNLOAD)} Сохранить результаты
     </button>
========================================================= */
import { toPng } from 'html-to-image';
import { gameAccentStyle } from './game-trail.js';
import { ICONS } from './icon-assets.js';
import { buildExportFilename, escapeHtml, formatRuDate, plural } from './logic/format.js';
import { CATEGORY, GAMES, STRUCTURE } from './state.js';
import { showToast } from './toast.js';

const REPORT_WIDTH = 1080;
const PIXEL_RATIO = 2;

// Everything in the results screen that is interaction chrome or is
// replaced by the report's own frame.
const STRIP_SELECTOR = [
  'p.eyebrow',
  'h2',
  '.pdf-row',
  '.nav-row',
  '.draft-banner',
  'button',
  '.chart-tooltip',
].join(',');

// Chip label doubles as the unit: «13» under «УЧАСТНИКОВ».
const PLURAL_PEOPLE = ['участник', 'участника', 'участников'];

const REPORT_CSS = `
.rx-stage {
  position: fixed;
  left: -20000px;
  top: 0;
  pointer-events: none;
}
.rx {
  width: ${REPORT_WIDTH}px;
  box-sizing: border-box;
  background: color-mix(in srgb, var(--game-accent) 5%, #fff);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  overflow: hidden;
}
.rx *, .rx *::before, .rx *::after { box-sizing: border-box; }

/* ---- header ---- */
.rx-head {
  position: relative;
  padding: 56px 64px 92px;
  color: #fff;
  background: linear-gradient(135deg, var(--game-accent) 0%, var(--game-accent-deep) 100%);
  overflow: hidden;
}
.rx-head::before, .rx-head::after {
  content: "";
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
}
.rx-head::before { width: 420px; height: 420px; right: -110px; top: -170px; }
.rx-head::after { width: 220px; height: 220px; right: 250px; bottom: -130px; background: rgba(255, 255, 255, 0.08); }
.rx-brand {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.rx-head h1 {
  position: relative;
  margin: 22px 0 0;
  max-width: 640px;
  font-size: 60px;
  line-height: 1.04;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #fff;
}
.rx-head .rx-sub {
  position: relative;
  margin: 18px 0 0;
  max-width: 600px;
  font-size: 23px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.9);
}
.rx-icon {
  position: absolute;
  right: 56px;
  top: 40px;
  width: 250px;
  height: 250px;
  object-fit: contain;
  filter: drop-shadow(0 18px 24px rgba(0, 0, 0, 0.28));
}

/* ---- meta card ---- */
.rx-meta {
  position: relative;
  display: flex;
  gap: 14px;
  margin: -46px 64px 0;
}
.rx-chip {
  flex: 1;
  min-width: 0;
  padding: 16px 20px;
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 10px 28px -10px rgba(43, 37, 64, 0.32);
}
.rx-chip-label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-faint);
}
.rx-chip-value {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 800;
  line-height: 1.2;
  color: var(--game-accent-deep);
}

/* ---- body (cloned results) ---- */
.rx-body {
  padding: 44px 64px 8px;
}
.rx-body > :first-child { margin-top: 0; }
.rx-body .reveal { margin-bottom: 28px; }
.rx-body .results-table { margin-bottom: 0; }
.rx-body .results-table + .results-table { margin-top: 30px; }
.rx-body p { max-width: none; }

/* ---- explainer + footer ---- */
.rx-what {
  margin: 36px 64px 0;
  padding: 28px 32px;
  border-radius: 22px;
  background: #fff;
  box-shadow: 0 8px 24px -12px rgba(43, 37, 64, 0.28);
}
.rx-what h3 {
  margin: 0 0 10px;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--game-accent-deep);
}
.rx-what p {
  margin: 0;
  max-width: none;
  font-size: 19px;
  line-height: 1.55;
  color: var(--ink-soft);
}
.rx-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 34px 64px 40px;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink-faint);
}
.rx-foot b { color: var(--game-accent-deep); }
`;

export const ReportExport = (() => {
  let current = null; // { gameId, data, root }

  function register(gameId, data, root = document) {
    current = { gameId, data, root };
    // Test hook (see test/export.spec.js) — lets a spec assert what the
    // report WILL say without rasterizing it. Off unless the test harness
    // sets window.__RETRO_TEST__ (test/lib.js), so nothing extra is exposed
    // in a real session.
    if (window.__RETRO_TEST__) window.__reportData = { gameId, ...data };
  }

  // Standard "N участников" chip data, reused by every game. `extra` is
  // an optional second line of detail ("2 раунда", "6 пар · 2 раунда").
  function meta(count, extra) {
    return { count, extra };
  }

  function findResultsBody(root) {
    const table = root.querySelector('.results-table');
    return table ? table.closest('.round-body') : null;
  }

  function chip(label, value) {
    return `<div class="rx-chip"><div class="rx-chip-label">${escapeHtml(label)}</div><div class="rx-chip-value">${escapeHtml(value)}</div></div>`;
  }

  function buildReport({ gameId, data, root }) {
    const game = GAMES.find((g) => g.id === gameId);
    const body = findResultsBody(root);
    if (!game || !body) throw new Error(`report: results not found for ${gameId}`);

    const category = CATEGORY[game.category]?.label ?? '';
    const chips = [
      chip(plural(data.meta.count, PLURAL_PEOPLE), String(data.meta.count)),
      chip('Формат', STRUCTURE[game.structure]?.label ?? '—'),
      chip('Время', game.time),
      chip('Дата', formatRuDate()),
    ];
    if (data.meta.extra) chips.splice(3, 0, chip('Детали', data.meta.extra));

    const stage = document.createElement('div');
    stage.className = 'rx-stage';
    stage.innerHTML = `
      <style>${REPORT_CSS}</style>
      <div class="rx" style="${gameAccentStyle(gameId)}">
        <header class="rx-head">
          <div class="rx-brand">5 минут общего развития${category ? ` · ${escapeHtml(category)}` : ''}</div>
          <h1>${escapeHtml(game.name)}</h1>
          <p class="rx-sub">${escapeHtml(data.subtitle)}</p>
          <img class="rx-icon" src="${ICONS[game.icon]}" alt="" />
        </header>
        <div class="rx-meta">${chips.join('')}</div>
        <main class="rx-body"></main>
        ${
          data.explanation
            ? `<section class="rx-what"><h3>Что это было</h3><p>${escapeHtml(data.explanation)}</p></section>`
            : ''
        }
        <footer class="rx-foot"><span><b>5 минут общего развития</b> · командные мини-эксперименты</span><span>${escapeHtml(formatRuDate())}</span></footer>
      </div>
    `;

    const target = stage.querySelector('.rx-body');
    for (const child of body.children) {
      if (child.matches(STRIP_SELECTOR)) continue;
      const clone = child.cloneNode(true);
      clone.querySelectorAll(STRIP_SELECTOR).forEach((el) => {
        el.remove();
      });
      target.append(clone);
    }
    return { stage, game };
  }

  async function download(button) {
    if (!current) return;
    if (button) {
      if (button.disabled) return;
      button.disabled = true;
    }
    let stage;
    try {
      const built = buildReport(current);
      stage = built.stage;
      document.body.append(stage);
      const node = stage.querySelector('.rx');
      // Layout + any in-flight chart transition settles before capture.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const dataUrl = await toPng(node, {
        pixelRatio: PIXEL_RATIO,
        skipFonts: true, // system font stack — nothing to embed
        cacheBust: false,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = buildExportFilename(built.game.name);
      document.body.append(a);
      a.click();
      a.remove();
      showToast('Результаты сохранены');
    } catch (err) {
      console.error(err);
      showToast('Не удалось сохранить результаты');
    } finally {
      stage?.remove();
      if (button) button.disabled = false;
    }
  }

  return { register, meta, download };
})();
