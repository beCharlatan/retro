// test/projector.spec.js
// The "show only" window (Экран для показа): a second window, opened from the game window, that
// shows the task, a large timer and the results — for sharing in a video call. Checks the link
// (opening, following the game, surviving reloads), what it shows and does not show (nothing
// meant for the facilitator or the groups leaves the game window), and that it fits without scrolling.

const { Report, withBrowser, enableTestHooks, DIST_URL, openGameFromHome } = require('./lib');
const { GAMES } = require('./games');

const NAMES = [
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
const BUTTON = '[data-testid="projector-open"]';

// A game window plus the projector it opens (both in one context, like two windows of one browser).
async function openPair(
  browser,
  report,
  { gameId, projector = { width: 1280, height: 720 } } = {},
) {
  const context = await browser.newContext({
    viewport: { width: 1100, height: 900 },
    reducedMotion: 'reduce',
  });
  await enableTestHooks(context);
  const page = await context.newPage();
  page.on('pageerror', (e) => report.fail('no uncaught JS errors (game window)', String(e)));
  await page.goto(DIST_URL);
  if (gameId) await openGameFromHome(page, gameId);
  const [pop] = await Promise.all([context.waitForEvent('page'), page.click(BUTTON)]);
  pop.on('pageerror', (e) => report.fail('no uncaught JS errors (projector)', String(e)));
  await pop.setViewportSize(projector);
  await pop.waitForLoadState();
  return { context, page, pop };
}

// What the projector shows right now.
const read = (pop) =>
  pop.evaluate(() => {
    const root = document.querySelector('retro-projector')?.shadowRoot;
    if (!root) return null;
    const stage = root.querySelector('.stage');
    const welcome = root.querySelector('retro-projector-welcome');
    const welcomeRoot = welcome?.shadowRoot ?? null;
    const timer = root.querySelector('[data-testid="projector-timer"]');
    const roster = root.querySelector('[data-testid="projector-roster"]');
    const entriesEl = root.querySelector('[data-testid="projector-entries"]');
    const squash = (t) => (t ?? '').replace(/\s+/g, ' ').trim();
    // a name chip's text without the letter in its avatar
    const nameOf = (el) =>
      squash(el.textContent.replace(el.querySelector('.avatar')?.textContent ?? '', ''));
    // the stage's text without the roster, where names are allowed
    let textNoRoster = '';
    if (stage) {
      const copy = stage.cloneNode(true);
      for (const el of copy.querySelectorAll(
        '[data-testid="projector-roster"], [data-testid="projector-entries"]',
      ))
        el.remove();
      textNoRoster = squash(copy.textContent);
    }
    const canvas = root.querySelector('.canvas')?.getBoundingClientRect();
    return {
      waiting: !!welcome,
      waitingText: squash(
        welcomeRoot?.querySelector('[data-testid="projector-waiting"]')?.textContent,
      ),
      welcome: welcomeRoot
        ? {
            people: [...welcomeRoot.querySelectorAll('[data-testid="welcome-person"]')].map((p) =>
              squash(p.textContent),
            ),
            firstColour:
              welcomeRoot.querySelector('[data-testid="welcome-person"] .dot')?.style.background ??
              '',
            empty: !!welcomeRoot.querySelector('[data-testid="welcome-empty"]'),
            icons: welcomeRoot.querySelectorAll('.float img').length,
            programme: squash(
              welcomeRoot.querySelector('[data-testid="welcome-programme"]')?.textContent,
            ),
            title: squash(welcomeRoot.querySelector('h1.title')?.getAttribute('aria-label')),
            wordAnimation: getComputedStyle(welcomeRoot.querySelector('.word')).animationName,
            iconAnimation: getComputedStyle(welcomeRoot.querySelector('.float img')).animationName,
            orbAnimation: getComputedStyle(welcomeRoot.querySelector('.orb')).animationName,
            hasHtmlInjected: welcomeRoot.querySelectorAll('.people img, .people b, .people script')
              .length,
          }
        : null,
      game: stage?.dataset.game ?? null,
      step: squash(root.querySelector('[data-testid="projector-step"]')?.textContent),
      text: squash(stage?.textContent),
      textNoRoster,
      hold: !!root.querySelector('[data-testid="projector-hold"]'),
      timer: timer
        ? {
            state: timer.dataset.state,
            time: timer.querySelector('.timer-time').textContent.trim(),
            label: timer.querySelector('.timer-label').textContent.trim(),
          }
        : null,
      roster: roster
        ? {
            kind: roster.dataset.kind,
            title: squash(roster.querySelector('.roster-title')?.textContent),
            groups: [...roster.querySelectorAll('.role-group-col')].map((g) => ({
              title: squash(g.querySelector('.role-group-title')?.textContent),
              count: squash(g.querySelector('.role-group-count')?.textContent),
              names: [...g.querySelectorAll('.role-chip')].map(nameOf),
            })),
            pairs: [...roster.querySelectorAll('.role-pair-card')].map((c) => ({
              names: [...c.querySelectorAll('.role-pair-name')].map(nameOf),
              labels: [...c.querySelectorAll('.role-pair-label')].map((n) => squash(n.textContent)),
              trio: !!c.querySelector('.role-pair-trio-badge'),
            })),
          }
        : null,
      entries: entriesEl
        ? {
            anonymous: entriesEl.dataset.anonymous === 'yes',
            title: squash(entriesEl.querySelector('.roster-title')?.textContent),
            count: squash(entriesEl.querySelector('.entries-count')?.textContent),
            empty: !!entriesEl.querySelector('.entries-empty'),
            text: squash(entriesEl.textContent),
            cards: [...entriesEl.querySelectorAll('.entry-card')].map((c) => ({
              who: [...c.querySelectorAll('.name-with-avatar')].map(nameOf),
              tag: squash(c.querySelector('.entry-tag')?.textContent),
              cells: [...c.querySelectorAll('.ec-cell')].map((x) => squash(x.textContent)),
            })),
            tiles: [...entriesEl.querySelectorAll('.anon-tile')].map((t) =>
              squash(t.querySelector('b')?.textContent),
            ),
          }
        : null,
      timerHeight: timer ? (timer.querySelector('.timer-badge')?.offsetHeight ?? null) : null,
      timerInRail: !!root.querySelector('.game-rail [data-testid="projector-timer"]'),
      timerCards: root.querySelectorAll('.timer-card').length,
      urgent: timer?.dataset.urgent === 'yes',
      pulse: !!root.querySelector('[data-testid="projector-pulse"]'),
      final: !!root.querySelector('[data-testid="projector-final"]'),
      ring: !!root.querySelector('.timer-ring'),
      timerOverTraveler: (() => {
        const t = root.querySelector('.trail-timer')?.getBoundingClientRect();
        const v = root.querySelector('.trail-traveler-img')?.getBoundingClientRect();
        if (!t || !v) return null;
        const dx = t.left + t.width / 2 - (v.left + v.width / 2);
        const dy = t.top + t.height / 2 - (v.top + v.height / 2);
        return Math.round(Math.hypot(dx, dy));
      })(),
      sceneText: squash(root.querySelector('.dictator-scene')?.textContent),
      controls: root.querySelectorAll('input, button, textarea, select, a, script, img').length,
      chartMarks: root.querySelectorAll('.pb-chart circle, .pb-chart rect').length,
      hasReveal: !!root.querySelector('.pb-reveal .reveal .n'),
      railTitle: squash(root.querySelector('.game-rail-title')?.textContent),
      trail: !!root.querySelector('.game-rail .game-trail svg image'),
      trailLabel: squash(root.querySelector('.game-rail .trail-step-label')?.textContent),
      meta: [...root.querySelectorAll('[data-testid="projector-meta"] .meta-card')].map((c) =>
        squash(c.textContent),
      ),
      accent: stage ? getComputedStyle(stage).getPropertyValue('--game-accent').trim() : '',
      scrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
      rects: canvas
        ? JSON.stringify({
            c: [canvas.left, canvas.top, canvas.right, canvas.bottom].map(Math.round),
            w: [window.innerWidth, window.innerHeight],
            k: document.querySelector('retro-projector').scale,
          })
        : null,
      fits: canvas
        ? canvas.left >= -1 &&
          canvas.right <= window.innerWidth + 1 &&
          canvas.top >= -1 &&
          canvas.bottom <= window.innerHeight + 1
        : null,
    };
  });

// Waits for the state, then a moment for the picture to be scaled to its final size.
async function settled(pop, test, timeout = 10000) {
  const first = await until(pop, test, timeout);
  if (!first) return null;
  await pop.waitForTimeout(600);
  return read(pop);
}

// The blanket "reduced motion" rule gives every property a one-frame transition, so a style read in
// the very frame a state changes can still show the old size; look again a moment later.
async function after(pop, test, timeout = 8000, wait = 150) {
  const first = await until(pop, test, timeout);
  if (!first) return null;
  await pop.waitForTimeout(wait);
  return read(pop);
}

async function until(pop, test, timeout = 8000) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeout) {
    last = await read(pop);
    if (last && test(last)) return last;
    await pop.waitForTimeout(120);
  }
  return null;
}

async function run() {
  const report = new Report();

  await withBrowser(async (browser) => {
    // ---------- opening ----------
    report.section('Экран для показа — открытие и связь');
    {
      const { context, page, pop } = await openPair(browser, report);
      try {
        report.check('на карте есть кнопка «экран для показа»', true);
        report.check(
          'открывается отдельное окно ?view=projector',
          pop.url().includes('view=projector'),
          pop.url(),
        );
        const waiting = await until(pop, (s) => s.waiting);
        report.check(
          'пока игра не выбрана — приветственный экран',
          !!waiting && waiting.waitingText.includes('ведущий выбирает игру'),
        );
        report.check(
          'приветствие: название и число игр',
          !!waiting &&
            waiting.welcome.title === '5 минут общего развития' &&
            /21 коротких игр/.test(waiting.waitingText),
        );

        const label = await page.getAttribute(BUTTON, 'aria-label');
        report.check('кнопка знает, что окно открыто', /открыт/.test(label), label);

        const before = context.pages().length;
        await page.click(BUTTON);
        await page.waitForTimeout(400);
        report.check(
          'повторный клик не плодит окна, а возвращает то же',
          context.pages().length === before,
        );

        await openGameFromHome(page, 'availability');
        const shown = await until(pop, (s) => s.game === 'availability');
        report.check(
          'выбрали игру — проектор показывает её',
          !!shown,
          JSON.stringify(shown?.text?.slice(0, 80)),
        );
        report.check(
          'в шапке — название игры и шаг',
          !!shown &&
            shown.text.includes('Эвристика доступности') &&
            /Шаг 1 из \d+/.test(shown.step),
          shown?.step,
        );

        // leaving the game
        await page.click('.game-exit');
        await page.click('dialog.confirm-dialog button[value="ok"]');
        const back = await until(pop, (s) => s.waiting);
        report.check('вышли на карту — проектор снова ждёт', !!back);
      } finally {
        await context.close();
      }
    }

    // ---------- the task, the timer ----------
    report.section('Экран для показа — вопрос и таймер');
    {
      const g = GAMES.find((x) => x.id === 'availability');
      const { context, page, pop } = await openPair(browser, report, { gameId: 'availability' });
      try {
        const intro = await until(pop, (s) => s.game === 'availability');
        report.check(
          'на вступлении не показаны шаги для ведущего («Задайте вопрос вслух»)',
          !!intro &&
            !intro.text.includes('Задайте вопрос вслух') &&
            !intro.text.includes('колебания'),
        );

        await g.toEntryScreen(page);
        const q = await until(pop, (s) => s.timer && /Вопрос 1 из/i.test(s.text));
        report.check(
          'в раунде вопроса — сам вопрос крупно',
          !!q && q.text.includes('ВОЗ объявила'),
          q?.text?.slice(0, 100),
        );
        report.check('…и оба варианта ответа', !!q && q.text.includes('COVID-19 или Туберкулёз'));
        report.check(
          'таймер ждёт запуска и показывает длительность',
          !!q && q.timer.state === 'idle' && q.timer.time === '0:20',
          JSON.stringify(q?.timer),
        );
        report.check(
          'на проекторе нет полей ввода и кнопок',
          !!q && q.controls === 0,
          String(q?.controls),
        );

        await page.click('button:has-text("Запустить таймер")');
        await page.waitForTimeout(2300);
        const run = await until(pop, (s) => s.timer && s.timer.state === 'running');
        const secs = run ? Number(run.timer.time.split(':')[1]) : NaN;
        report.check(
          'запустили — таймер идёт и на проекторе',
          !!run && secs < 20 && secs >= 15,
          JSON.stringify(run?.timer),
        );

        await page.click('button:has-text("Сбросить")');
        const idle = await until(pop, (s) => s.timer && s.timer.state === 'idle');
        report.check('сбросили — таймер снова ждёт', !!idle);

        // a short one, to see it run out
        const input = page.locator('.round-timer-input').first();
        await input.fill('0:05');
        await input.press('Enter');
        await page.click('button:has-text("Запустить таймер")');
        const done = await after(pop, (s) => s.timer && s.timer.state === 'done', 15000);
        report.check(
          'время вышло — на проекторе «Время вышло»',
          !!done && done.timer.time === '0:00' && done.timer.label === 'Время вышло',
          JSON.stringify(done?.timer),
        );
        report.check(
          'время вышло — таймер свёрнут в тонкую плашку без кольца',
          !!done && !done.ring && done.timerHeight <= 60,
          `${done?.timerHeight}px, ring: ${done?.ring}`,
        );
        report.check(
          '…плашка на карте раундов, а не карточка в колонке',
          !!done && done.timerInRail && done.timerCards === 0,
        );
        report.check('…и вспышка «время вышло»', !!done && done.final);

        // started again: the full timer comes back
        await page.waitForSelector('button:has-text("Запустить снова")');
        await page.click('button:has-text("Запустить снова")');
        const again = await until(pop, (s) => s.timer?.state === 'running');
        report.check(
          'запустили снова — снова кольцо на карте',
          !!again && again.ring && again.timerInRail,
          JSON.stringify(again?.timer ?? (await read(pop))?.timer),
        );
      } finally {
        await context.close();
      }
    }

    // ---------- results ----------
    report.section('Экран для показа — результаты и график');
    {
      const g = GAMES.find((x) => x.id === 'availability');
      const { context, page, pop } = await openPair(browser, report, { gameId: 'availability' });
      try {
        await g.toEntryScreen(page);
        await g.fill(page, {});
        await g.toResults(page);
        const res = await settled(pop, (s) => s.hasReveal && s.chartMarks > 0);
        report.check('на результатах — главная цифра', !!res && res.hasReveal);
        report.check(
          '…и график с метками (дождались конца анимации)',
          !!res && res.chartMarks >= 4,
          String(res?.chartMarks),
        );
        report.check(
          'объяснения «что это / как читать» остались у ведущего',
          !!res && !res.text.includes('Как читать') && res.text.includes('У вашей команды'),
        );
        report.check(
          'на результатах нет ни полей, ни кнопок',
          !!res && res.controls === 0,
          String(res?.controls),
        );
        report.check(
          'результаты помещаются в окно без прокрутки',
          !!res && res.fits === true && res.scrolls === false,
          JSON.stringify({ fits: res?.fits, scrolls: res?.scrolls }),
        );

        // a smaller, differently-shaped window
        await pop.setViewportSize({ width: 800, height: 600 });
        await pop.waitForTimeout(400);
        const small = await read(pop);
        report.check(
          'в окне 800×600 тоже помещается',
          small.fits === true && small.scrolls === false,
          JSON.stringify({ fits: small.fits, scrolls: small.scrolls }),
        );
        await pop.setViewportSize({ width: 1920, height: 1080 });
        await pop.waitForTimeout(400);
        const big = await read(pop);
        report.check('в окне 1920×1080 тоже', big.fits === true && big.scrolls === false);
      } finally {
        await context.close();
      }
    }

    {
      // The game window redraws its chart on every update, which replays the animation (this game's
      // chart animates even under reduced motion); the projector must keep showing the chart meanwhile.
      const g = GAMES.find((x) => x.id === 'crowd-wisdom');
      const { context, page, pop } = await openPair(browser, report, { gameId: 'crowd-wisdom' });
      try {
        await g.toEntryScreen(page);
        await g.fill(page, {});
        await g.toResults(page);
        await settled(pop, (s) => s.hasReveal && s.chartMarks > 0, 15000);
        let blinked = 0;
        let samples = 0;
        for (let round = 0; round < 3; round++) {
          await page.evaluate(() =>
            document.querySelector('retro-game-crowd-wisdom').requestUpdate(),
          );
          for (let i = 0; i < 20; i++) {
            const now = await read(pop);
            samples++;
            if (!now || now.chartMarks === 0) blinked++;
            await pop.waitForTimeout(80);
          }
        }
        report.check(
          'график не пропадает, пока игра его перерисовывает',
          blinked === 0,
          `${blinked} из ${samples}`,
        );
      } finally {
        await context.close();
      }
    }

    // ---------- who is in which group / pair ----------
    report.section('Экран для показа — составы групп и пар');
    {
      // Framing: two groups.
      const { context, page, pop } = await openPair(browser, report, { gameId: 'framing' });
      try {
        const intro = await until(pop, (s) => s.game === 'framing');
        report.check('на вступлении состава ещё нет', !!intro && intro.roster === null);

        await page.click('button:has-text("Распределить группы")');
        const mainNames = async () =>
          page.evaluate(() => {
            const r = document.querySelector('retro-game-framing').shadowRoot;
            return [...r.querySelectorAll('.role-group-col')].map((c) =>
              [...c.querySelectorAll('.role-chip')]
                .map((x) =>
                  x.textContent
                    .replace(x.querySelector('.avatar')?.textContent ?? '', '')
                    .replace(/\s+/g, ' ')
                    .trim(),
                )
                .sort(),
            );
          });
        const same = (roster, main) =>
          JSON.stringify(roster.groups.map((g) => g.names.slice().sort())) === JSON.stringify(main);

        let main = await mainNames();
        const roles = await until(pop, (s) => s.roster && same(s.roster, main), 5000);
        report.check(
          'на экране распределения — обе группы с участниками',
          !!roles && roles.roster.kind === 'groups',
          JSON.stringify(roles?.roster?.groups?.map((g) => g.title)),
        );
        report.check('…состав совпадает с окном ведущего', !!roles);
        report.check(
          '…все 14 человек на месте, каждый по одному разу',
          !!roles &&
            roles.roster.groups
              .flatMap((g) => g.names)
              .sort()
              .join('|') === NAMES.slice().sort().join('|'),
        );
        report.check(
          '…у групп подписи с числом человек',
          !!roles && roles.roster.groups.every((g) => /^\d+ чел\.$/.test(g.count)),
        );
        report.check('…и всё это без кнопок', !!roles && roles.controls === 0);

        // shuffle: the projector follows
        const before = JSON.stringify(main);
        await page.click('button:has-text("Перемешать группы")');
        await page.waitForTimeout(300);
        main = await mainNames();
        const shuffled = await until(pop, (s) => s.roster && same(s.roster, main), 5000);
        report.check(
          'перемешали в игре — состав на проекторе обновился',
          !!shuffled && JSON.stringify(main) !== before,
        );

        // it stays on the scenario screens, next to the timer
        await page.click('button:has-text("Дальше")');
        await page.waitForTimeout(500);
        const scenario = await until(pop, (s) => s.roster && s.timer);
        report.check(
          'на экране сценария состав остаётся рядом с таймером',
          !!scenario && scenario.roster.groups.length === 2,
        );

        // and is gone on the results
        await GAMES.find((x) => x.id === 'framing')
          .toEntryScreen(page)
          .catch(() => {});
      } finally {
        await context.close();
      }
    }
    {
      // Ultimatum: pairs with roles, which swap in round 2.
      const g = GAMES.find((x) => x.id === 'ultimatum');
      const { context, page, pop } = await openPair(browser, report, { gameId: 'ultimatum' });
      try {
        await page.click('button:has-text("Распределить пары")');
        const roles = await until(pop, (s) => s.roster?.kind === 'pairs');
        report.check(
          'Ультиматум: на экране пар — 7 карточек',
          !!roles && roles.roster.pairs.length === 7,
          String(roles?.roster?.pairs?.length),
        );
        report.check(
          '…в каждой — двое и подписи ролей',
          !!roles &&
            roles.roster.pairs.every(
              (p) => p.names.length === 2 && p.labels.join('|') === 'Предлагающий|Отвечающий',
            ),
        );
        const proposers = roles?.roster.pairs.map((p) => p.names[0]).join('|');

        await page.click('button:has-text("Дальше")');
        await g.fill(page, {});
        await page.click('#next-btn-1');
        const swapped = await until(pop, (s) => s.roster?.pairs?.[0]?.labels?.[0] === 'Отвечающий');
        report.check('во втором раунде роли на проекторе поменялись местами', !!swapped);
        report.check(
          '…а пары те же',
          !!swapped && swapped.roster.pairs.map((p) => p.names[0]).join('|') === proposers,
        );
        report.check(
          '…и заголовок это говорит',
          !!swapped && /роли поменялись/.test(swapped.roster.title),
          swapped?.roster?.title,
        );
      } finally {
        await context.close();
      }
    }
    {
      // Prisoner's dilemma: pairs; after round 1, also what each pair chose.
      const g = GAMES.find((x) => x.id === 'prisoners-dilemma');
      const { context, page, pop } = await openPair(browser, report, {
        gameId: 'prisoners-dilemma',
      });
      try {
        await page.click('button:has-text("Распределить пары")');
        const roles = await until(pop, (s) => s.roster?.kind === 'pairs');
        report.check(
          'Дилемма: на экране пар — 7 карточек без ходов',
          !!roles &&
            roles.roster.pairs.length === 7 &&
            roles.roster.pairs.every((p) => p.labels.length === 0),
        );
        await page.click('button:has-text("Дальше")');
        await g.fill(page, {});
        await page.click('#next-btn-1');
        const recap = await until(pop, (s) => s.roster?.pairs?.[0]?.labels?.length === 2);
        report.check(
          'после раунда 1 у каждой пары видно, что выбрал каждый',
          !!recap && recap.roster.pairs.every((p) => /Сотрудничал|Предал/.test(p.labels.join(' '))),
          JSON.stringify(recap?.roster?.pairs?.[0]),
        );
      } finally {
        await context.close();
      }
    }
    {
      // Endowment: sellers and buyers.
      const { context, page, pop } = await openPair(browser, report, { gameId: 'endowment' });
      try {
        await page.click('button:has-text("Распределить группы")');
        const s = await until(pop, (x) => x.roster?.kind === 'groups');
        report.check(
          'Эффект владения: видно, кто продаёт, а кто покупает',
          !!s &&
            s.roster.groups
              .map((g) => g.title)
              .join('|')
              .includes('Владельцы') &&
            s.roster.groups
              .map((g) => g.title)
              .join('|')
              .includes('Покупатели'),
          JSON.stringify(s?.roster?.groups?.map((g) => g.title)),
        );
      } finally {
        await context.close();
      }
    }
    {
      // A game without groups shows no roster at all.
      const { context, pop } = await openPair(browser, report, { gameId: 'dictator' });
      try {
        const s = await until(pop, (x) => x.game === 'dictator');
        report.check('в играх без групп блока состава нет', !!s && s.roster === null);
      } finally {
        await context.close();
      }
    }

    // ---------- results as they are typed in ----------
    report.section('Экран для показа — данные по ходу заполнения');
    {
      const g = GAMES.find((x) => x.id === 'anchoring');
      const { context, page, pop } = await openPair(browser, report, { gameId: 'anchoring' });
      try {
        await g.toEntryScreen(page);
        const empty = await until(pop, (s) => s.entries);
        report.check(
          'до первого ответа — пустая панель «внесено 0 из 14»',
          !!empty && empty.entries.empty && /0\s*из 14/.test(empty.entries.count),
          empty?.entries?.count,
        );
        report.check('…а не «Минутку»', !!empty && !empty.hold);

        const inputs = async () => page.$$('[data-testid="entry-body"] input, #entry-body input');
        const ins = await inputs();
        await ins[0].fill('42');
        const first = await until(pop, (s) => s.entries?.cards.length === 1);
        report.check(
          'внесли одно число — человек появился с ним',
          !!first &&
            first.entries.cards[0].who[0] === NAMES[0] &&
            first.entries.cards[0].cells.length === 1 &&
            first.entries.cards[0].cells[0].includes('42'),
          JSON.stringify(first?.entries?.cards),
        );
        await ins[1].fill('30');
        const both = await until(pop, (s) => s.entries?.cards[0]?.cells.length === 2);
        report.check(
          '…внесли второе — оно добавилось в ту же карточку',
          !!both &&
            both.entries.cards[0].cells[1].includes('30%') &&
            /1\s*из 14/.test(both.entries.count),
          both?.entries?.count,
        );

        // three more people, one after another
        for (let i = 1; i <= 3; i++) {
          await ins[i * 2].fill(String(10 + i));
          await ins[i * 2 + 1].fill(String(20 + i));
          const now = await until(pop, (s) => s.entries?.cards.length === i + 1);
          report.check(
            `внесли ${i + 1}-го — на экране ${i + 1} карточки в порядке участников`,
            !!now && now.entries.cards.map((c) => c.who[0]).join() === NAMES.slice(0, i + 1).join(),
            JSON.stringify(now?.entries?.cards?.map((c) => c.who[0])),
          );
        }
        const four = await read(pop);
        report.check(
          'счётчик «внесено» растёт: 4 из 14',
          /4\s*из 14/.test(four.entries.count),
          four.entries.count,
        );
        report.check(
          '…и всё помещается без прокрутки',
          four.fits === true && four.scrolls === false,
          four.rects,
        );
        report.check('…без полей и кнопок', four.controls === 0);

        // erase a value: the person's card follows
        await ins[6].fill('');
        await ins[7].fill('');
        const dropped = await until(pop, (s) => s.entries?.cards.length === 3);
        report.check('стёрли данные человека — его карточка пропала', !!dropped);
      } finally {
        await context.close();
      }
    }
    {
      // The dictator game: round 1 is anonymous — amounts only, no names, in an order that says nothing.
      const { context, page, pop } = await openPair(browser, report, { gameId: 'dictator' });
      try {
        const intro = await until(pop, (s) => s.game === 'dictator');
        report.check(
          '«Диктатор», вступление: на экране условие — сумма и два варианта',
          !!intro &&
            intro.sceneText.includes('1 000 ₽') &&
            intro.sceneText.includes('Оставить себе') &&
            intro.sceneText.includes('Отдать коллеге'),
          intro?.sceneText,
        );
        report.check(
          '…но без гипотезы («меняется только одна деталь»)',
          !!intro && !intro.text.includes('одна деталь') && !intro.text.includes('суммы'),
        );

        await page.click('button:has-text("Раунд 1")');
        await until(pop, (s) => s.timer && s.sceneText);
        await pop.waitForTimeout(800); // the map's traveler glides to this step
        const r1 = await read(pop);
        report.check(
          'раунд 1: есть таймер на 0:20',
          !!r1 && r1.timer.time === '0:20' && r1.timer.state === 'idle',
          JSON.stringify(r1?.timer),
        );
        report.check(
          '…заголовок про суть, а не про инструкцию ведущему',
          !!r1 && r1.text.includes('Сколько вы отдадите?') && !r1.text.includes('Впишите'),
        );
        report.check('…и правило раунда: анонимно', !!r1 && r1.sceneText.includes('Анонимно'));
        report.check(
          '…таймер на карте раундов, отдельной карточки в колонке нет',
          !!r1 && r1.timerInRail && r1.timerCards === 0,
          JSON.stringify({ rail: r1?.timerInRail, cards: r1?.timerCards }),
        );
        report.check(
          '…кольцо посажено на иконку игры (в пределах 6px от её центра)',
          !!r1 && r1.timerOverTraveler !== null && r1.timerOverTraveler <= 6,
          String(r1?.timerOverTraveler),
        );

        await page.click('button:has-text("Запустить таймер")');
        const running = await until(pop, (s) => s.timer?.state === 'running');
        report.check('таймер запускается и на проекторе', !!running);
        // once time is up the timer folds away and the entries get its place
        await page.evaluate(() => {
          const h = document.querySelector('retro-game-dictator');
          h.timers.timer.state = { ...h.timers.timer.state, seconds: 0, running: false };
          h.requestUpdate();
        });
        const folded = await after(pop, (x) => x.timer?.state === 'done', 4000);
        report.check(
          'у «Диктатора» после «Время вышло» — тонкая плашка вместо карточки',
          !!folded && !folded.ring && folded.timerHeight <= 60,
          `${folded?.timerHeight}px ${JSON.stringify(folded?.timer)} ring:${folded?.ring}`,
        );
        report.check('…а вводимые суммы при этом остаются на экране', !!folded && !!folded.entries);

        const ins = await page.$$('[data-testid="entry-body-1"] input');
        await ins[0].fill('300');
        await ins[1].fill('0');
        await ins[2].fill('1000');
        await ins[3].fill('450');
        const anon = await until(pop, (s) => s.entries?.tiles.length === 4);
        report.check(
          'раунд 1 анонимный: показаны только суммы',
          !!anon && anon.entries.anonymous && anon.entries.cards.length === 0,
          JSON.stringify(anon?.entries?.tiles),
        );
        report.check(
          '…отсортированы по возрастанию, а не по порядку ввода',
          !!anon && anon.entries.tiles.join('|') === ['0 ₽', '300 ₽', '450 ₽', '1 000 ₽'].join('|'),
          anon?.entries?.tiles?.join('|'),
        );
        report.check(
          '…и нигде на экране нет ни одного имени',
          !!anon && NAMES.every((n) => !anon.text.includes(n)),
          NAMES.find((n) => anon?.text.includes(n)),
        );
        report.check(
          '…подпись «без имён», счётчик 4 из 14',
          !!anon && /без имён/.test(anon.entries.title) && /4\s*из 14/.test(anon.entries.count),
        );

        // round 2: named
        for (let i = 4; i < 14; i++) await ins[i].fill(String(100 + i));
        await page.click('[data-testid="next-btn-1"]');
        await page.waitForTimeout(600);
        const ins2 = await page.$$('[data-testid="entry-body-2"] input');
        await ins2[0].fill('500');
        await ins2[1].fill('100');
        const named = await until(
          pop,
          (s) => s.entries && !s.entries.anonymous && s.entries.cards.length === 2,
        );
        report.check(
          'раунд 2 — уже с именами',
          !!named &&
            named.entries.cards[0].who[0] === NAMES[0] &&
            named.entries.cards[0].cells[0].includes('500'),
          JSON.stringify(named?.entries?.cards),
        );
        report.check(
          '…правило: рядом с суммой будет имя',
          !!named && named.sceneText.includes('с суммой будет ваше имя'),
        );
        report.check(
          '…и у второго раунда свой таймер 0:20, не запущенный',
          !!named && named.timer.state === 'idle' && named.timer.time === '0:20',
          JSON.stringify(named?.timer),
        );
      } finally {
        await context.close();
      }
    }
    {
      // Public goods: anonymous as well.
      const { context, page, pop } = await openPair(browser, report, { gameId: 'public-goods' });
      try {
        await page.click('button:has-text("Раунд 1")');
        const ins = await page.$$('[data-testid="entry-body-1"] input');
        await ins[0].fill('80');
        await ins[1].fill('20');
        const s = await until(pop, (x) => x.entries?.tiles.length === 2);
        report.check(
          'Общественное благо: вклады без имён, по возрастанию',
          !!s &&
            s.entries.anonymous &&
            s.entries.tiles.join('|') === '20|80' &&
            NAMES.every((n) => !s.text.includes(n)),
          JSON.stringify(s?.entries?.tiles),
        );
      } finally {
        await context.close();
      }
    }
    {
      // A pair game: both names in one card.
      const g = GAMES.find((x) => x.id === 'ultimatum');
      const { context, page, pop } = await openPair(browser, report, { gameId: 'ultimatum' });
      try {
        await g.toEntryScreen(page);
        const ins = await page.$$('#entry-body-1 input');
        await ins[0].fill('350');
        await ins[1].fill('200');
        const s = await until(pop, (x) => x.entries?.cards.length === 1);
        report.check(
          'Ультиматум: карточка пары — двое и обе суммы',
          !!s &&
            s.entries.cards[0].who.length === 2 &&
            s.entries.cards[0].cells.length === 2 &&
            s.entries.cards[0].cells[0].includes('350'),
          JSON.stringify(s?.entries?.cards),
        );
        report.check(
          '…«пар», а не «человек»',
          !!s && /из 7 пар/.test(s.entries.count),
          s?.entries?.count,
        );
      } finally {
        await context.close();
      }
    }
    {
      // Question by question: only the current question's answers.
      const { context, page, pop } = await openPair(browser, report, { gameId: 'availability' });
      try {
        await GAMES.find((x) => x.id === 'availability').toEntryScreen(page);
        const q1 = await page.$$('#entry-body-0 [data-val="a"]');
        await q1[0].click();
        await q1[1].click();
        const s = await until(pop, (x) => x.entries?.cards.length === 2 && x.timer);
        report.check(
          'Доступность: ответы на текущий вопрос — с текстом варианта',
          !!s && s.entries.cards[0].cells[0].includes('COVID-19'),
          JSON.stringify(s?.entries?.cards?.[0]),
        );
        report.check('…и рядом с ними таймер', !!s && s.timer.time === '0:20');
      } finally {
        await context.close();
      }
    }

    // ---------- the welcome screen ----------
    report.section('Экран для показа — приветственный экран');
    {
      // motion on: the screen is alive
      const context = await browser.newContext({
        viewport: { width: 1100, height: 900 },
        reducedMotion: 'no-preference',
      });
      await enableTestHooks(context);
      const page = await context.newPage();
      page.on('pageerror', (e) => report.fail('no uncaught JS errors (game window)', String(e)));
      await page.goto(DIST_URL);
      const [pop] = await Promise.all([context.waitForEvent('page'), page.click(BUTTON)]);
      pop.on('pageerror', (e) => report.fail('no uncaught JS errors (projector)', String(e)));
      await pop.setViewportSize({ width: 1440, height: 810 });
      try {
        const w = await until(pop, (s) => s.waiting && s.welcome?.people.length === 14, 8000);
        report.check(
          'приветствие: сегодняшняя команда из окна ведущего — 14 человек',
          !!w,
          JSON.stringify(w?.welcome?.people?.length),
        );
        report.check(
          '…в том же порядке, что в списке игроков',
          !!w && w.welcome.people.map((p) => p.replace(/^./, '')).join('|') === NAMES.join('|'),
          w?.welcome?.people?.slice(0, 3).join('|'),
        );
        report.check(
          'вокруг плавают все 21 иконка игр',
          !!w && w.welcome.icons === GAMES.length,
          String(w?.welcome?.icons),
        );
        report.check(
          'всё анимировано: слова заголовка, иконки и световые шары',
          !!w &&
            /rise/.test(w.welcome.wordAnimation) &&
            w.welcome.iconAnimation === 'drift' &&
            /orb/.test(w.welcome.orbAnimation),
          JSON.stringify([
            w?.welcome?.wordAnimation,
            w?.welcome?.iconAnimation,
            w?.welcome?.orbAnimation,
          ]),
        );
        report.check(
          'вместо голого текста «Экран для показа» — приветствие с названием приложения',
          !!w && !w.waitingText.includes('Экран для показа'),
        );

        const first = w?.welcome?.programme;
        const changed = await until(pop, (s) => s.welcome && s.welcome.programme !== first, 9000);
        report.check(
          'строка «в программе» сама меняется на следующую игру',
          !!changed,
          `${first} → ${changed?.welcome?.programme}`,
        );

        // the colours match the app's avatars
        const homeColour = await page.evaluate(() => {
          const host = document.querySelector('retro-home');
          host.players.open = true;
          host.requestUpdate();
          return null;
        });
        void homeColour;
        await page.waitForTimeout(400);
        const appColour = await page.evaluate(() => {
          const row = document
            .querySelector('retro-home')
            .shadowRoot.querySelector('.player-row .avatar');
          return row?.style.background ?? '';
        });
        report.check(
          'цвет аватара на проекторе тот же, что в приложении',
          !!w && appColour !== '' && w.welcome.firstColour === appColour,
          `${w?.welcome?.firstColour} / ${appColour}`,
        );

        // the team changes → the welcome follows, live
        await page.fill('#new-participant', 'Богдан');
        await page.click('#add-participant-btn');
        const added = await until(pop, (s) => s.welcome?.people.length === 15, 4000);
        report.check(
          'добавили игрока в приложении — на приветствии он появился',
          !!added && added.welcome.people.at(-1).endsWith('Богдан'),
        );

        await page.click('.player-row:has-text("Богдан") .player-active');
        const off = await until(pop, (s) => s.welcome?.people.length === 14, 4000);
        report.check(
          'сняли галочку «играет сегодня» — он исчез с приветствия',
          !!off && off.welcome.people.every((p) => !p.endsWith('Богдан')),
        );

        await page.click('#clear-players-btn');
        await page.click('dialog.confirm-dialog button[value="ok"]');
        const none = await until(pop, (s) => s.welcome?.empty, 4000);
        report.check(
          'удалили всех — понятная подсказка вместо пустого места',
          !!none && /игроков добавляет ведущий/.test(none.waitingText),
          none?.waitingText?.slice(0, 120),
        );

        // then a game: the welcome gives way; leaving it brings the welcome back with the team
        await page.click('#sample-btn');
        const again = await until(pop, (s) => s.welcome?.people.length === 14, 4000);
        report.check('«Заполнить примером» — команда вернулась и на приветствии', !!again);
        await openGameFromHome(page, 'anchoring');
        const game = await until(pop, (s) => s.game === 'anchoring');
        report.check('выбрали игру — приветствие сменилось игрой', !!game && !game.waiting);
        await page.click('.game-exit');
        await page.click('dialog.confirm-dialog button[value="ok"]');
        const back = await until(pop, (s) => s.welcome?.people.length === 14, 6000);
        report.check('вышли из игры — снова приветствие с командой', !!back);
      } finally {
        await context.close();
      }
    }
    {
      // reduced motion: the same screen, standing still
      const context = await browser.newContext({
        viewport: { width: 1100, height: 900 },
        reducedMotion: 'reduce',
      });
      await enableTestHooks(context);
      const page = await context.newPage();
      await page.goto(DIST_URL);
      const [pop] = await Promise.all([context.waitForEvent('page'), page.click(BUTTON)]);
      await pop.setViewportSize({ width: 1440, height: 810 });
      try {
        const w = await until(pop, (s) => s.waiting && s.welcome?.people.length === 14, 8000);
        report.check(
          'при «уменьшить движение» приветствие неподвижно, но всё на месте',
          !!w &&
            w.welcome.wordAnimation === 'none' &&
            w.welcome.iconAnimation === 'none' &&
            w.welcome.icons === GAMES.length &&
            w.welcome.people.length === 14,
          JSON.stringify([w?.welcome?.wordAnimation, w?.welcome?.iconAnimation]),
        );
      } finally {
        await context.close();
      }
    }
    {
      // names are text, not markup
      const context = await browser.newContext({
        viewport: { width: 1100, height: 900 },
        reducedMotion: 'reduce',
      });
      await enableTestHooks(context, {
        players: ['<img src=x onerror=__pwned=1>', '<b>Жирный</b>', 'Добрый'],
      });
      const page = await context.newPage();
      await page.goto(DIST_URL);
      const [pop] = await Promise.all([context.waitForEvent('page'), page.click(BUTTON)]);
      await pop.setViewportSize({ width: 1280, height: 720 });
      try {
        const w = await until(pop, (s) => s.welcome?.people.length === 3, 6000);
        const pwned = await pop.evaluate(() => window.__pwned ?? null);
        report.check(
          'имена с HTML показываются текстом и ничего не выполняют',
          !!w &&
            w.welcome.hasHtmlInjected === 0 &&
            w.welcome.people.some((p) => p.includes('<b>Жирный</b>')) &&
            pwned === null,
          JSON.stringify(w?.welcome?.people),
        );
      } finally {
        await context.close();
      }
    }

    // ---------- the timer on the round map ----------
    report.section('Экран для показа — таймер на карте раундов, пульс в последние секунды');
    {
      const { context, page, pop } = await openPair(browser, report, { gameId: 'dictator' });
      try {
        await page.click('button:has-text("Раунд 1")');
        await until(pop, (s) => s.timer);
        const input = page.locator('.round-timer-input').first();
        await input.fill('0:08');
        await input.press('Enter');
        const idle = await until(pop, (s) => s.timer?.state === 'idle' && s.timer.time === '0:08');
        report.check(
          'таймер ждёт: бледное кольцо и «0:08»',
          !!idle && idle.ring && !idle.urgent && !idle.pulse,
        );

        await page.click('button:has-text("Запустить таймер")');
        // watch every tick from 0:08 down to time-up
        const seen = new Map();
        let final = false;
        const start = Date.now();
        while (Date.now() - start < 11000) {
          const s = await read(pop);
          if (s?.timer) {
            const key = s.timer.time;
            const prev = seen.get(key) ?? { urgent: false, pulse: false };
            seen.set(key, { urgent: prev.urgent || s.urgent, pulse: prev.pulse || s.pulse });
            if (s.timer.state === 'done' && s.final) {
              final = true;
              break;
            }
          }
          await pop.waitForTimeout(60);
        }
        const at = (t) => seen.get(t);
        report.check(
          'дольше пяти секунд — спокойный цвет, без пульса',
          ['0:08', '0:07', '0:06'].every((t) => at(t) && !at(t).urgent && !at(t).pulse),
          JSON.stringify([...seen]),
        );
        report.check(
          'последние пять секунд — кольцо и цифры краснеют',
          ['0:05', '0:04'].every((t) => at(t)?.urgent) &&
            ['0:03', '0:02', '0:01'].every((t) => at(t)?.urgent),
          JSON.stringify([...seen]),
        );
        report.check(
          '…но экран пока не пульсирует (0:05 и 0:04)',
          ['0:05', '0:04'].every((t) => at(t) && !at(t).pulse),
        );
        report.check(
          'последние три секунды экран пульсирует (0:03, 0:02, 0:01)',
          ['0:03', '0:02', '0:01'].every((t) => at(t)?.pulse),
          JSON.stringify([...seen]),
        );
        report.check('время вышло — вспышка на весь экран', final);

        await pop.waitForTimeout(400);
        const after = await read(pop);
        report.check(
          'после вспышки пульса больше нет, кольцо убрано',
          !!after && !after.pulse && !after.ring && after.timer.state === 'done',
        );

        // the timer follows the traveler to the next round
        await page.click('button:has-text("Запустить снова")').catch(() => {});
        await page.click('button:has-text("Сбросить")').catch(() => {});
        const ins = await page.$$('[data-testid="entry-body-1"] input');
        for (let i = 0; i < 3; i++) await ins[i].fill(String(100 * (i + 1)));
        await page.click('[data-testid="next-btn-1"]');
        await pop.waitForTimeout(1200);
        const r2 = await until(pop, (s) => s.timer?.state === 'idle' && s.step.includes('Шаг 3'));
        report.check(
          'в раунде 2 таймер переехал за иконкой на следующую точку карты',
          !!r2 && r2.timerOverTraveler <= 6,
          String(r2?.timerOverTraveler),
        );
      } finally {
        await context.close();
      }
    }
    {
      // reduced motion: no beating animation — a steady frame instead, and it goes away with the beat
      const context = await browser.newContext({
        viewport: { width: 1100, height: 900 },
        reducedMotion: 'reduce',
      });
      await enableTestHooks(context);
      const page = await context.newPage();
      await page.goto(DIST_URL);
      await openGameFromHome(page, 'dictator');
      const [pop] = await Promise.all([context.waitForEvent('page'), page.click(BUTTON)]);
      await pop.setViewportSize({ width: 1280, height: 720 });
      try {
        await page.click('button:has-text("Раунд 1")');
        const input = page.locator('.round-timer-input').first();
        await input.fill('0:05');
        await input.press('Enter');
        await page.click('button:has-text("Запустить таймер")');
        const beat = await until(pop, (s) => s.pulse, 8000);
        const animated = beat
          ? await pop.evaluate(() => {
              const el = document
                .querySelector('retro-projector')
                .shadowRoot.querySelector('[data-testid="projector-pulse"]');
              return getComputedStyle(el).animationName;
            })
          : null;
        report.check(
          'при «уменьшить движение» пульс есть, но без анимации',
          !!beat && animated === 'none',
          String(animated),
        );
      } finally {
        await context.close();
      }
    }

    // ---------- looks like the app ----------
    report.section('Экран для показа — оформление как в приложении');
    {
      const { context, page, pop } = await openPair(browser, report, { gameId: 'ultimatum' });
      try {
        const s = await until(pop, (x) => x.game === 'ultimatum');
        report.check(
          'справа — название игры и тропа с её 3D-иконкой',
          !!s && s.railTitle === 'Ультиматум' && s.trail,
          s?.railTitle,
        );
        report.check(
          '…и «Шаг 1 из 6», как в игре',
          !!s && s.trailLabel === 'Шаг 1 из 6',
          s?.trailLabel,
        );
        report.check(
          'на первом экране — карточки: время, формат, направление',
          !!s &&
            s.meta.length === 3 &&
            s.meta.some((m) => m.includes('10 мин')) &&
            s.meta.some((m) => m.includes('По парам')),
          JSON.stringify(s?.meta),
        );
        const mainAccent = await page.evaluate(() =>
          getComputedStyle(
            document.querySelector('retro-game-ultimatum').shadowRoot.querySelector('.wrap-wide'),
          )
            .getPropertyValue('--game-accent')
            .trim(),
        );
        report.check(
          'цвет игры на проекторе — тот же, что в приложении',
          !!s && s.accent === mainAccent && mainAccent !== '',
          `${s?.accent} / ${mainAccent}`,
        );
        await page.click('button:has-text("Распределить пары")');
        await page.waitForTimeout(500);
        const later = await read(pop);
        report.check(
          'шаг на тропе идёт за игрой',
          later.trailLabel === 'Шаг 2 из 6',
          later.trailLabel,
        );
        report.check('мета-карточки только на первом экране', later.meta.length === 0);
      } finally {
        await context.close();
      }
    }

    // ---------- what stays private ----------
    report.section('Экран для показа — что не должно попасть на экран');
    {
      // Framing: the two wordings are for the groups; the facilitator opens them in the game window.
      const framing = GAMES.find((x) => x.id === 'framing');
      const { context, page, pop } = await openPair(browser, report, { gameId: 'framing' });
      try {
        await page.click('button:has-text("Распределить группы")');
        await page.waitForTimeout(150);
        await page.click('button:has-text("Дальше")');
        await page.waitForTimeout(400);
        await page.click('#toggle-a');
        await page.click('#toggle-b');
        const wordingA = (await page.textContent('#text-a')).replace(/\s+/g, ' ').trim();
        const wordingB = (await page.textContent('#text-b')).replace(/\s+/g, ' ').trim();
        report.check(
          '(в игровом окне тексты групп раскрыты)',
          wordingA.includes('Программа 1') && wordingB.includes('Программа 1'),
        );

        const s = await until(pop, (x) => x.game === 'framing' && x.timer);
        report.check(
          'проектор показывает сценарий и таймер',
          !!s && s.text.includes('Проект на 600 человек'),
          s?.step,
        );
        report.check(
          '…с подписью для зала, а не для ведущего',
          !!s && s.timer.label === 'на обсуждение и ответ',
          s?.timer?.label,
        );
        report.check(
          '…но не сами тексты групп',
          !!s &&
            !s.text.includes('спасено ровно 200') &&
            !s.text.includes('умрёт ровно 400') &&
            !s.text.includes('Программа 1 —'),
        );
        report.check('…и не подсказку «Тексты спрятаны»', !!s && !s.text.includes('спрятаны'));
        report.check(
          '…зато состав групп виден (люди должны знать свою группу)',
          !!s && s.roster?.kind === 'groups' && s.roster.groups.length === 2,
          JSON.stringify(s?.roster?.groups?.map((g) => g.title)),
        );
        report.check(
          '…а имён вне блока состава нет',
          !!s && NAMES.every((n) => !s.textNoRoster.includes(n)),
        );
        report.check('…нет кнопок «Скопировать»/«Показать»', !!s && s.controls === 0);

        await framing.toEntryScreen(page).catch(() => {});
      } finally {
        await context.close();
      }
    }
    {
      // Barnum: the questions and the portrait text are private; the intro explains the trick.
      const { context, page, pop } = await openPair(browser, report, { gameId: 'barnum' });
      try {
        await page.click('#toggle-questions');
        await page.click('#toggle-profile');
        const questions = (await page.textContent('#text-questions')).replace(/\s+/g, ' ').trim();
        const profile = (await page.textContent('#text-profile')).replace(/\s+/g, ' ').trim();
        report.check(
          '(в игровом окне вопросы и портрет раскрыты)',
          questions.length > 20 && profile.length > 20,
        );
        const s = await until(pop, (x) => x.game === 'barnum');
        report.check(
          'проектор на вступлении Барнума: без вопросов и текста портрета',
          !!s && !s.text.includes(profile.slice(0, 40)) && !s.text.includes(questions.slice(0, 40)),
        );
        report.check(
          '…и без объяснения фокуса («якобы составленный»)',
          !!s && !s.text.includes('якобы') && !s.text.includes('накануне'),
        );
      } finally {
        await context.close();
      }
    }
    {
      // False consensus: the question is public (people answer it), the facilitator's notes are not.
      const { context, page, pop } = await openPair(browser, report, { gameId: 'false-consensus' });
      try {
        await GAMES.find((x) => x.id === 'false-consensus').toEntryScreen(page);
        const s = await until(pop, (x) => x.timer && x.text.includes('процент команды'));
        const question = await page.$eval('#fc-question-text', (el) => el.textContent.trim());
        report.check(
          'в «Ложном консенсусе» на экране — вопрос к залу',
          !!s && s.text.includes(question.replace(/^«|»[\s\S]*$/g, '')),
          s?.text?.slice(0, 120),
        );
        report.check('…и таймер 0:30', !!s && s.timer.time === '0:30', JSON.stringify(s?.timer));
      } finally {
        await context.close();
      }
    }

    // ---------- every game, every stage ----------
    report.section('Экран для показа — все 21 игра: ни полей, ни имён, ни подсказок ведущему');
    for (const game of GAMES) {
      const { context, page, pop } = await openPair(browser, report, { gameId: game.id });
      try {
        const facilitatorOnly = [
          'Не подглядывайте',
          'не подглядывайте',
          'Задайте вопрос вслух',
          'Прочитайте вслух',
          'не забегайте вперёд',
        ];
        const stages = [];
        stages.push(['вступление', await settled(pop, (s) => s.game === game.id)]);
        await game.toEntryScreen(page);
        await page.waitForTimeout(500);
        stages.push(['ввод', await read(pop)]);
        await game.fill(page, {});
        await game.toResults(page);
        stages.push(['результаты', await settled(pop, (s) => s.hasReveal && s.chartMarks > 0)]);

        for (const [label, s] of stages) {
          report.check(`${game.name} · ${label}: экран получен`, !!s && s.game === game.id);
          if (!s) continue;
          report.check(
            `${game.name} · ${label}: нет полей ввода и кнопок`,
            s.controls === 0,
            String(s.controls),
          );
          report.check(
            `${game.name} · ${label}: нет реплик для ведущего`,
            facilitatorOnly.every((t) => !s.text.includes(t)),
          );
          report.check(
            `${game.name} · ${label}: помещается без прокрутки`,
            s.fits === true && s.scrolls === false,
            s.rects,
          );
          if (label !== 'результаты') {
            report.check(
              `${game.name} · ${label}: имён участников нет`,
              NAMES.every((n) => !s.textNoRoster.includes(n)),
              NAMES.find((n) => s.textNoRoster.includes(n)),
            );
          }
        }
        const res = stages[2][1];
        report.check(
          `${game.name}: на результатах цифра и график`,
          !!res && res.hasReveal && res.chartMarks > 0,
        );
      } catch (e) {
        report.fail(`${game.name}: проход для проектора`, String(e).split('\n')[0]);
      } finally {
        await context.close();
      }
    }

    // ---------- robustness ----------
    report.section('Экран для показа — перезагрузки и чужие сообщения');
    {
      const { context, page, pop } = await openPair(browser, report, { gameId: 'availability' });
      try {
        await until(pop, (s) => s.game === 'availability');

        // the projector window is reloaded
        await pop.reload();
        const again = await until(pop, (s) => s.game === 'availability', 9000);
        report.check('окно проектора перезагрузили — картинка вернулась сама', !!again);

        // the game window is reloaded: the projector keeps waiting, then follows the next game
        await page.reload();
        const waiting = await until(pop, (s) => s.game === 'availability' || s.waiting, 3000);
        report.check('(игровое окно перезагружено)', !!waiting);
        await openGameFromHome(page, 'dictator');
        const followed = await until(pop, (s) => s.game === 'dictator', 12000);
        report.check(
          'после перезагрузки игрового окна проектор снова следует за игрой',
          !!followed,
        );

        // messages must come from the game window that opened it, and be harmless
        const hostile = {
          channel: 'retro-projector',
          v: 1,
          type: 'snapshot',
          rev: 'x:1',
          snapshot: {
            kind: 'game',
            gameId: 'evil',
            gameName: 'Проверка',
            accent: 'position:fixed;top:0',
            step: { index: 0, total: 1, title: 'x' },
            timer: null,
            blocks: [
              {
                role: 'body',
                html: '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script><a href="javascript:window.__pwned=1">x</a><svg><circle r="3"></circle></svg><b onclick="window.__pwned=1">жирный</b>',
              },
            ],
          },
        };
        await pop.evaluate((msg) => window.postMessage(msg, '*'), hostile);
        await pop.waitForTimeout(300);
        const ignored = await read(pop);
        report.check(
          'сообщение не от окна-родителя игнорируется',
          ignored.game === 'dictator',
          String(ignored.game),
        );

        await page.evaluate((msg) => {
          const w = window.open('', 'retro-projector');
          w.postMessage(msg, '*');
        }, hostile);
        const shown = await until(pop, (s) => s.game === 'evil', 3000);
        report.check('от родителя принимается (проверка канала)', !!shown);
        const pwned = await pop.evaluate(() => window.__pwned ?? null);
        report.check('вредный HTML не выполняется', pwned === null);
        const parts = await pop.evaluate(() => {
          const r = document.querySelector('retro-projector').shadowRoot;
          return {
            img: r.querySelectorAll('img').length,
            script: r.querySelectorAll('script').length,
            a: r.querySelectorAll('a').length,
            svg: r.querySelectorAll('.pb-body svg circle').length,
            b: r.querySelectorAll('b').length,
            onclick: r.querySelectorAll('[onclick]').length,
            style: r.querySelector('.stage').getAttribute('style') || '',
          };
        });
        report.check(
          '…опасные теги и атрибуты вычищены, безопасная разметка осталась',
          parts.img === 0 &&
            parts.script === 0 &&
            parts.a === 0 &&
            parts.onclick === 0 &&
            parts.svg === 1 &&
            parts.b === 1,
          JSON.stringify(parts),
        );
        report.check(
          '…а чужой стиль акцента не попал в разметку',
          !parts.style.includes('position'),
          parts.style,
        );

        // names in a roster are typed by people: they are shown as text, never as markup
        const evilName = '<img src=x onerror=__pwned=1>';
        await page.evaluate((msg) => window.open('', 'retro-projector').postMessage(msg, '*'), {
          ...hostile,
          rev: 'x:2',
          snapshot: {
            ...hostile.snapshot,
            blocks: [],
            roster: {
              kind: 'pairs',
              title: 'Пары',
              pairs: [{ a: evilName, b: 'Добрый', tagA: '<b>x</b>', tagB: '' }],
            },
          },
        });
        await pop.waitForTimeout(500);
        const roster = await pop.evaluate(() => {
          const r = document.querySelector('retro-projector').shadowRoot;
          return {
            imgs: r.querySelectorAll('.roster img').length,
            bolds: r.querySelectorAll('.roster b').length,
            text: r.querySelector('.roster')?.textContent ?? '',
            pwned: window.__pwned ?? null,
          };
        });
        report.check(
          'имя с HTML в составе показывается текстом и не выполняется',
          roster.imgs === 0 &&
            roster.bolds === 0 &&
            roster.text.includes('<img src=x') &&
            roster.pwned === null,
          JSON.stringify(roster).slice(0, 160),
        );
      } finally {
        await context.close();
      }
    }
    {
      // Opened by hand (no game window behind it).
      const context = await browser.newContext({
        viewport: { width: 900, height: 600 },
        reducedMotion: 'reduce',
      });
      const lone = await context.newPage();
      try {
        await lone.goto(`${DIST_URL}?view=projector`);
        const s = await until(lone, (x) => x.waiting);
        report.check(
          'окно, открытое вручную, объясняет, как его открывать',
          !!s && s.waitingText.includes('кнопкой'),
          s?.waitingText,
        );
      } finally {
        await context.close();
      }
    }
  });

  return report;
}

module.exports = { run };

if (require.main === module) {
  run().then((r) => process.exit(r.summary() ? 0 : 1));
}
