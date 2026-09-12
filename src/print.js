/* =========================================================
   SHARED PATTERN: export the results screen as PDF
   =========================================================
   Uses the browser's native print pipeline (window.print())
   with a dedicated @media print stylesheet in styles.css —
   no external libraries, works offline, and lets the person
   pick "Save as PDF" in the print dialog on any device.

   Print CSS hides all navigation chrome (crumbs, progress
   dots, nav buttons, other screens) and keeps only the
   results screen's own content — reveal number, chart,
   stat/group cards and the results table — compacted to
   fit a single A4 page, with a printed header carrying the
   game's name, one-line description and a participant count
   so the sheet is self-explanatory once shared with players.

   The browser's "Save as PDF" dialog suggests document.title
   as the filename — so Print.mount() also remembers a
   filename built from the game's name + today's date
   ("Эффект_якоря_10.09.2026"), and Print.run() swaps the tab
   title to it just for the moment of printing, restoring the
   page's real title as soon as the print dialog closes
   (via the native `afterprint` event, fires on save AND on
   cancel).

   ---------------------------------------------------------
   USAGE (inside a game's *ShowResults function, right
   before navigating to the results screen):

     Print.mount('results-print-header', {
       title: 'Эффект якоря',
       subtitle: 'Случайное число незаметно сдвигает вашу же числовую оценку.',
       meta: Print.meta(filled.length),
       explanation: 'Случайное число, увиденное прямо перед оценкой, ' +
         'задаёт «якорь» — и итоговый ответ смещается в его сторону, ' +
         'даже когда число совершенно нерелевантно. Открыли эффект ' +
         'Тверски и Канеман в 1974 году.'
     });
     anchoringGoTo(2);

   And in the results screen's own template, add the mount point plus
   the export button (kept out of the printed page itself via
   .pdf-row being hidden in print CSS) — and a matching print-footer
   mount point right after the results table if you're passing
   `explanation` (the "print-header-X" / "print-footer-X" naming
   convention is what wires them together, see mount() below):

     <div class="print-header" id="results-print-header"></div>
     ...
     <table class="results-table">...</table>
     <div class="print-footer" id="results-print-footer"></div>
     <div class="pdf-row">
       <button class="ghost" id="pdf-btn" onclick="Print.run()">🖨️  Сохранить / отправить PDF</button>
     </div>
========================================================= */
const Print = (() => {
  const ORIGINAL_TITLE = document.title;
  let pendingFilename = null;

  function mount(id, data) {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = `
        <div class="print-kicker">5 минут общего развития</div>
        <div class="print-title">${data.title}</div>
        <div class="print-subtitle">${data.subtitle}</div>
        <div class="print-meta">${data.meta}</div>
      `;
      pendingFilename = buildFilename(data.title);
    }

    // Optional "what this was" explainer, printed below the results
    // table so the sheet is self-explanatory for anyone who gets a
    // copy without having seen the live context screen. Looked up by
    // naming convention: print-header-X's companion is print-footer-X.
    if (data.explanation) {
      const footerEl = document.getElementById(id.replace('header', 'footer'));
      if (footerEl) {
        footerEl.innerHTML = `
          <div class="print-footer-title">Что это было</div>
          <div class="print-footer-text">${data.explanation}</div>
        `;
      }
    }
  }

  // "Эффект_якоря_10.09.2026" — no extension, the browser's print-to-PDF
  // driver appends .pdf itself; adding it here risks a doubled-up name.
  function buildFilename(gameTitle) {
    const date = new Date();
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const slug = String(gameTitle)
      .replace(/[:/\\*?"<>|]/g, '')
      .trim()
      .replace(/\s+/g, '_');
    return `${slug}_${dd}.${mm}.${yyyy}`;
  }

  // Standard "N участников · дата" meta line, reused by every game.
  function meta(count, extra) {
    const date = new Date().toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const base = `${count} ${peopleWord(count)} · ${date}`;
    return extra ? `${base} · ${extra}` : base;
  }

  function peopleWord(n) {
    const mod10 = n % 10,
      mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'участник';
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'участника';
    return 'участников';
  }

  function run() {
    if (pendingFilename) {
      document.title = pendingFilename;
    }
    window.print();
  }

  // Fires whether the person saved or cancelled — either way the tab's
  // real title should come back.
  window.addEventListener('afterprint', () => {
    document.title = ORIGINAL_TITLE;
  });

  return { mount, run, meta };
})();
