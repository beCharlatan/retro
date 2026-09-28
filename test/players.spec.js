// test/players.spec.js
// Who plays is managed in the app, not in the code: the panel on the home map. Checks a first run
// with nobody in the list, adding / renaming / removing / switching off for the day, pasting a list,
// clearing, that the list survives a reload, that games use exactly the people who play today,
// and that a game can't be started without a team.

const {
  Report,
  withBrowser,
  enableTestHooks,
  DIST_URL,
  openGameFromHome,
  TEST_PLAYERS,
} = require('./lib');
const { GAMES } = require('./games');

const COUNT = '[data-testid="players-count"]';

async function open(browser, report, { players = TEST_PLAYERS, reducedMotion = 'reduce' } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 900 },
    reducedMotion,
  });
  await enableTestHooks(context, { players });
  const page = await context.newPage();
  page.on('pageerror', (e) => report.fail('no uncaught JS errors', String(e)));
  await page.goto(DIST_URL);
  await page.waitForTimeout(300);
  return { context, page };
}
const openPanel = async (page) => {
  if ((await page.getAttribute('.roster-toggle', 'aria-expanded')) !== 'true')
    await page.click('.roster-toggle');
  await page.waitForTimeout(350);
};
const names = (page) =>
  page.$$eval('.player-row .player-name', (els) => els.map((e) => e.textContent.trim()));
const stored = (page) =>
  page.evaluate(() => JSON.parse(window.localStorage.getItem('retro.players.v1') ?? 'null'));

async function run() {
  const report = new Report();

  await withBrowser(async (browser) => {
    // ---------- first run ----------
    report.section('Игроки — первый запуск, список пуст');
    {
      const { context, page } = await open(browser, report, { players: null });
      try {
        report.check(
          'в коде списка нет: счётчик на кнопке — 0',
          (await page.textContent('.roster-toggle .badge')).trim() === '0',
        );
        await openPanel(page);
        report.check(
          'панель говорит «Пока никого нет»',
          await page.isVisible('[data-testid="players-empty"]'),
        );
        report.check(
          'и предлагает «Заполнить примером» / «Вставить списком»',
          (await page.isVisible('#sample-btn')) && (await page.isVisible('#bulk-toggle-btn')),
        );
        report.check(
          '«Удалить всех» не показывается, когда удалять некого',
          !(await page.isVisible('#clear-players-btn')),
        );

        // a game can't be started without a team
        await page.click('.roster-toggle'); // close
        await page.waitForTimeout(350);
        await page.click('[data-game-id="anchoring"]');
        await page.waitForTimeout(250);
        await page.click('button:has-text("Начать игру")');
        await page.waitForTimeout(400);
        const toast = await page.textContent('#toast');
        report.check(
          '«Начать игру» без игроков не запускает игру и объясняет почему',
          /Добавьте игроков/.test(toast) && !(await page.$('retro-game-anchoring')),
          toast,
        );
        report.check(
          '…а панель игроков раскрывается и курсор — в поле имени',
          await page.evaluate(() => {
            const root = document.querySelector('retro-home').shadowRoot;
            return root.activeElement?.id === 'new-participant';
          }),
        );
        await page.click('#random-game-btn');
        await page.waitForTimeout(300);
        report.check(
          '«Случайная игра» тоже не стартует без игроков',
          !(await page.$('retro-game-anchoring')) &&
            /Добавьте игроков/.test(await page.textContent('#toast')),
        );

        await page.click('#sample-btn');
        await page.waitForTimeout(150);
        report.check(
          '«Заполнить примером» — 14 человек',
          (await names(page)).length === 14,
          String((await names(page)).length),
        );
        report.check('…и они сохранены в localStorage', (await stored(page))?.length === 14);
      } finally {
        await context.close();
      }
    }

    // ---------- adding ----------
    report.section('Игроки — добавление и проверка имён');
    {
      const { context, page } = await open(browser, report);
      try {
        await openPanel(page);
        const before = (await names(page)).length;
        await page.fill('#new-participant', '  Богдан   Иванов ');
        await page.press('#new-participant', 'Enter');
        await page.waitForTimeout(100);
        const list = await names(page);
        report.check(
          'Enter добавляет игрока, пробелы схлопнуты',
          list.length === before + 1 && list.at(-1) === 'Богдан Иванов',
          list.at(-1),
        );
        report.check(
          'поле очищено и в фокусе (можно вводить следующего)',
          await page.evaluate(() => {
            const root = document.querySelector('retro-home').shadowRoot;
            const el = root.getElementById('new-participant');
            return el.value === '' && root.activeElement === el;
          }),
        );

        await page.fill('#new-participant', 'олег');
        await page.click('#add-participant-btn');
        report.check(
          'повтор имени (без учёта регистра) отклонён с понятным текстом',
          /уже есть/.test(await page.textContent('[data-testid="players-error"]')) &&
            (await names(page)).length === before + 1,
        );
        await page.fill('#new-participant', '   ');
        await page.click('#add-participant-btn');
        report.check(
          'пустое имя отклонено',
          /Введите имя/.test(await page.textContent('[data-testid="players-error"]')),
        );
        await page.fill('#new-participant', 'x'.repeat(40));
        await page.click('#add-participant-btn');
        report.check(
          'слишком длинное имя отклонено',
          /длиннее 30/.test(await page.textContent('[data-testid="players-error"]')),
        );
        await page.fill('#new-participant', 'Ок');
        await page.press('#new-participant', 'x');
        report.check(
          '…сообщение об ошибке пропадает, как только начали печатать',
          (await page.textContent('[data-testid="players-error"]')).trim() === '',
        );

        await page.fill('#new-participant', '<b>Жирный</b>');
        await page.click('#add-participant-btn');
        const bold = await page.evaluate(
          () =>
            document.querySelector('retro-home').shadowRoot.querySelectorAll('.player-list b')
              .length,
        );
        report.check(
          'имя с HTML показывается как текст',
          bold === 0 && (await names(page)).includes('<b>Жирный</b>'),
        );
      } finally {
        await context.close();
      }
    }

    // ---------- rename / remove / switch off ----------
    report.section('Игроки — переименование, снятие с игры, удаление');
    {
      const { context, page } = await open(browser, report);
      try {
        await openPanel(page);
        await page.click('.player-row:has-text("Михаил") .player-name');
        await page.fill('#edit-player', 'Миша');
        await page.press('#edit-player', 'Enter');
        await page.waitForTimeout(100);
        let list = await names(page);
        report.check(
          'клик по имени → правка → Enter переименовывает',
          list[0] === 'Миша' && !list.includes('Михаил'),
          list[0],
        );
        report.check('…и сохраняет порядок и число людей', list.length === 14);

        await page.click('.player-row:has-text("Миша") .player-name');
        await page.fill('#edit-player', 'Виктория');
        await page.press('#edit-player', 'Enter');
        report.check(
          'переименование в уже занятое имя отклонено, поле остаётся для правки',
          /уже есть/.test(await page.textContent('[data-testid="players-error"]')) &&
            (await page.isVisible('#edit-player')),
        );
        await page.press('#edit-player', 'Escape');
        await page.waitForTimeout(100);
        list = await names(page);
        report.check(
          'Escape отменяет правку',
          list[0] === 'Миша' && !(await page.isVisible('#edit-player')),
        );

        // switch off for today
        const total = (await names(page)).length;
        await page.click('.player-row:has-text("Олег") .player-active');
        await page.click('.player-row:has-text("Ирина") .player-active');
        await page.waitForTimeout(100);
        report.check(
          'снятая галочка — «играют 12 из 14»',
          (await page.textContent(COUNT)).includes('играют 12 из 14'),
          await page.textContent(COUNT),
        );
        report.check(
          '…счётчик на кнопке показывает только играющих',
          (await page.textContent('.roster-toggle .badge')).trim() === '12',
        );
        report.check(
          '…люди остаются в списке (не нужно вводить заново)',
          (await names(page)).length === total,
        );
        report.check('…но строка приглушена', (await page.$$('.player-row.off')).length === 2);

        // the games use exactly those who play today
        await page.click('.roster-toggle');
        await page.waitForTimeout(350);
        await openGameFromHome(page, 'anchoring');
        await GAMES.find((g) => g.id === 'anchoring').toEntryScreen(page);
        const rows = await page.$$eval(
          'retro-game-anchoring',
          (els) => els[0].shadowRoot.querySelectorAll('.entry-row .name').length,
        );
        report.check('в игре — 12 строк, без снятых с игры', rows === 12, String(rows));
        const inGame = await page.$$eval('retro-game-anchoring', (els) =>
          [...els[0].shadowRoot.querySelectorAll('.entry-row .name')].map((e) => e.textContent),
        );
        report.check(
          '…и Олега с Ириной в ней нет',
          inGame.every((n) => !n.includes('Олег') && !n.includes('Ирина')),
        );
        await page.click('.game-exit');
        await page.click('dialog.confirm-dialog button[value="ok"]');
        await page.waitForTimeout(400);

        // back: switch on, remove
        await openPanel(page);
        await page.click('#all-in-btn');
        report.check(
          '«Играют все» возвращает всех',
          (await page.textContent(COUNT)).includes('14 человек'),
        );
        await page.click('.player-row:has-text("Таня") .player-x');
        report.check(
          '× удаляет игрока',
          !(await names(page)).includes('Таня') && (await names(page)).length === 13,
        );
      } finally {
        await context.close();
      }
    }

    // ---------- pasting a list ----------
    report.section('Игроки — список целиком');
    {
      const { context, page } = await open(browser, report, { players: ['Анна', 'Борис'] });
      try {
        await openPanel(page);
        await page.click('#bulk-toggle-btn');
        await page.fill('#bulk-text', 'Вера, Глеб\nДаша;анна\n  \nЕвгений\tБорис');
        await page.click('#bulk-add-btn');
        await page.waitForTimeout(150);
        const list = await names(page);
        report.check(
          'вставили список — добавлены новые, повторы пропущены',
          list.join('|') === 'Анна|Борис|Вера|Глеб|Даша|Евгений',
          list.join('|'),
        );
        report.check(
          '…и сказано, сколько добавлено и сколько пропущено',
          /Добавлено 4, пропущено 2/.test(await page.textContent('#toast')),
          await page.textContent('#toast'),
        );
        report.check('поле списка закрылось', !(await page.isVisible('#bulk-text')));
      } finally {
        await context.close();
      }
    }

    // ---------- persistence ----------
    report.section('Игроки — список помнится');
    {
      const { context, page } = await open(browser, report);
      try {
        await openPanel(page);
        await page.fill('#new-participant', 'Богдан');
        await page.press('#new-participant', 'Enter');
        await page.click('.player-row:has-text("Олег") .player-active');
        await page.click('.player-row:has-text("Анатолий") .player-x');
        await page.waitForTimeout(150);
        const before = { names: await names(page), count: await page.textContent(COUNT) };
        await page.reload();
        await page.waitForTimeout(400);
        await openPanel(page);
        const after = { names: await names(page), count: await page.textContent(COUNT) };
        report.check(
          'после перезагрузки список тот же: имена, порядок, кто не играет',
          JSON.stringify(before) === JSON.stringify(after),
          `${before.count} / ${after.count}`,
        );
        report.check(
          '…и снятый с игры остался снятым',
          (await page.$$('.player-row.off')).length === 1,
        );
        report.check(
          '…а «Богдан» и удалённый «Анатолий» — как оставили',
          after.names.includes('Богдан') && !after.names.includes('Анатолий'),
        );
        report.check(
          'о том, что список не сохраняется, ничего не пишется (сохраняется)',
          !(await page.isVisible('[data-testid="players-unsaved"]')),
        );
      } finally {
        await context.close();
      }
    }

    // ---------- clearing, minimum team ----------
    report.section('Игроки — удалить всех и минимальная команда');
    {
      const { context, page } = await open(browser, report);
      try {
        await openPanel(page);
        await page.click('#clear-players-btn');
        await page.click('dialog.confirm-dialog button[value="cancel"]');
        report.check('«Отмена» в диалоге ничего не удаляет', (await names(page)).length === 14);
        await page.click('#clear-players-btn');
        await page.click('dialog.confirm-dialog button[value="ok"]');
        await page.waitForTimeout(150);
        report.check(
          '«Удалить всех» после подтверждения — список пуст и сохранён пустым',
          (await names(page)).length === 0 && (await stored(page))?.length === 0,
        );
        report.check(
          '…и после перезагрузки он остаётся пустым, а не возвращается из кода',
          await (async () => {
            await page.reload();
            await page.waitForTimeout(400);
            return (await page.textContent('.roster-toggle .badge')).trim() === '0';
          })(),
        );

        // one person is not a team
        await openPanel(page);
        await page.fill('#new-participant', 'Один');
        await page.press('#new-participant', 'Enter');
        report.check(
          'один игрок — предупреждение «нужно хотя бы 2»',
          /хотя бы 2/.test(await page.textContent('[data-testid="players-problem"]')),
        );
        await page.click('.roster-toggle');
        await page.waitForTimeout(350);
        await page.click('[data-game-id="anchoring"]');
        await page.waitForTimeout(250);
        await page.click('button:has-text("Начать игру")');
        await page.waitForTimeout(300);
        report.check('…и игру не запустить', !(await page.$('retro-game-anchoring')));
        await openPanel(page);
        await page.fill('#new-participant', 'Двое');
        await page.press('#new-participant', 'Enter');
        await page.click('.roster-toggle');
        await page.waitForTimeout(350);
        await page.click('[data-game-id="anchoring"]');
        await page.waitForTimeout(250);
        await page.click('button:has-text("Начать игру")');
        await page.waitForTimeout(500);
        report.check('двое — игра запускается', !!(await page.$('retro-game-anchoring')));
      } finally {
        await context.close();
      }
    }

    // ---------- damaged storage ----------
    report.section('Игроки — испорченное хранилище');
    {
      const context = await browser.newContext({
        viewport: { width: 1200, height: 900 },
        reducedMotion: 'reduce',
      });
      await context.addInitScript(() => {
        window.localStorage.setItem('retro.players.v1', '{not json');
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      try {
        await page.goto(DIST_URL);
        await page.waitForTimeout(400);
        report.check(
          'битые данные не ломают приложение: пустая команда, без ошибок',
          errors.length === 0 && (await page.textContent('.roster-toggle .badge')).trim() === '0',
          errors.join(' | '),
        );
        await openPanel(page);
        await page.click('#sample-btn');
        report.check('…и список можно собрать заново', (await names(page)).length === 14);
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
