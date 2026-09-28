// test/games.js
// One entry per game, encoding exactly how to drive it through
// Playwright: reach the data-entry screen, fill some/all fields, move
// to results, and sanity-check what rendered. Reused by smoke.spec.js,
// persistence.spec.js and export.spec.js so none of them have to know the
// per-game DOM quirks themselves.
//
// `fill(page, opts)` — opts.count lets a test fill only the first N
// rows (for partial-fill / draft-recovery scenarios); omitted fills all.

async function clickAll(page, selector) {
  const els = await page.$$(selector);
  for (const el of els) await el.click();
}

const GAMES = [
  {
    id: 'anchoring',
    name: 'Эффект якоря',
    async toEntryScreen(page) {
      await page.click('button:has-text("Вносить данные")');
    },
    async fill(page, opts = {}) {
      const inputs = await page.$$('[data-testid="entry-body"] input');
      const rows = inputs.length / 2;
      const n = opts.count ?? rows;
      for (let i = 0; i < n; i++) {
        await inputs[i * 2].fill(String(10 + i));
        await inputs[i * 2 + 1].fill(String(20 + i));
      }
      return n;
    },
    async toResults(page) {
      await page.click('button:has-text("Показать результаты")');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('28%');
    },
  },
  {
    id: 'crowd-wisdom',
    name: 'Мудрость толпы',
    async toEntryScreen(page) {
      await page.click('button:has-text("Вносить данные")');
    },
    async fill(page, opts = {}) {
      const inputs = await page.$$('#entry-body input');
      const n = opts.count ?? inputs.length;
      for (let i = 0; i < n; i++) await inputs[i].fill(String(300 + i * 10));
      return n;
    },
    async toResults(page) {
      await page.click('button:has-text("Показать результаты")');
    },
    async verifyResults(page) {
      // .reveal .n is the pooled "% of guesses beaten by the team
      // average" stat now (three questions, no single "true value" to
      // show there) — the ISS's 420 t lives in #answers-reveal instead
      // (crowd-wisdom.js's "Правильные ответы: (1) 420 т · ...").
      const answers = await page.textContent('#answers-reveal');
      return answers.includes('420');
    },
  },
  {
    id: 'dictator',
    name: 'Игра диктатора',
    // First game migrated to a Lit/Shadow DOM custom element (see
    // docs/modernization-plan.md Phase 2) — selectors here use
    // data-testid instead of id, per that migration's decision (CSS
    // Modules would hash class names, so tests shouldn't depend on
    // them; ids still work fine but data-testid is the deliberate,
    // consistent hook going forward). Playwright's CSS engine pierces
    // open shadow roots automatically for these, same as for ids/classes.
    async toEntryScreen(page) {
      await page.click('button:has-text("Раунд 1")');
    },
    async fill(page, opts = {}) {
      const inputs = await page.$$('[data-testid="entry-body-1"] input');
      const n = opts.count ?? inputs.length;
      for (let i = 0; i < n; i++) await inputs[i].fill(String(100 + i * 20));
      return n;
    },
    async toResults(page) {
      await page.click('[data-testid="next-btn-1"]');
      await page.waitForTimeout(80);
      const inputs = await page.$$('[data-testid="entry-body-2"] input');
      for (let i = 0; i < inputs.length; i++) await inputs[i].fill(String(150 + i * 20));
      await page.click('[data-testid="next-btn-2"]');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return /\d/.test(n);
    },
  },
  {
    id: 'public-goods',
    name: 'Общественное благо',
    // Shadow DOM Lit component (docs/modernization-plan.md Phase 3) —
    // data-testid instead of id, same as dictator's pilot.
    async toEntryScreen(page) {
      await page.click('button:has-text("Раунд 1")');
    },
    async fill(page, opts = {}) {
      const inputs = await page.$$('[data-testid="entry-body-1"] input');
      const n = opts.count ?? inputs.length;
      for (let i = 0; i < n; i++) await inputs[i].fill(String(40 + i * 5));
      return n;
    },
    async toResults(page) {
      await page.click('[data-testid="next-btn-1"]');
      await page.waitForTimeout(80);
      const inputs = await page.$$('[data-testid="entry-body-2"] input');
      for (let i = 0; i < inputs.length; i++) await inputs[i].fill(String(30 + i * 4));
      await page.click('[data-testid="next-btn-2"]');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.length > 0;
    },
  },
  {
    id: 'false-consensus',
    name: 'Ложный консенсус',
    async toEntryScreen(page) {
      await page.click('button:has-text("Вносить данные")');
    },
    async fill(page, opts = {}) {
      const rows = await page.$$('#entry-body .entry-row');
      const n = opts.count ?? rows.length;
      for (let i = 0; i < n; i++) {
        const val = i % 2 === 0 ? 'yes' : 'no';
        await (await rows[i].$(`button[data-val="${val}"]`)).click();
        await (await rows[i].$('input')).fill(String(30 + i * 5));
      }
      return n;
    },
    async toResults(page) {
      await page.click('button:has-text("Показать результаты")');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('%');
    },
  },
  {
    id: 'barnum',
    name: 'Эффект Барнума',
    async toEntryScreen(page) {
      await page.click('button:has-text("Вносить данные")');
    },
    async fill(page, opts = {}) {
      const inputs = await page.$$('#entry-body input');
      const n = opts.count ?? inputs.length;
      for (let i = 0; i < n; i++) await inputs[i].fill(String(i % 6));
      return n;
    },
    async toResults(page) {
      await page.click('button:has-text("Показать результаты")');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('/ 5');
    },
  },
  {
    id: 'availability',
    name: 'Эвристика доступности',
    async toEntryScreen(page) {
      await page.click('button:has-text("Начать вопросы")');
    },
    async fill(page, opts = {}) {
      const rows = await page.$$('#entry-body-0 .entry-row');
      const n = opts.count ?? rows.length;
      for (let i = 0; i < n; i++) await (await rows[i].$('button[data-val="a"]')).click();
      return n;
    },
    async toResults(page) {
      // #entry-body-N directly (N = question index) instead of
      // ".screen.active .toggle-pair" — every round is always in the
      // DOM now (src/game-shell.js), not just one "active" one, so the
      // old selector matched nothing here.
      await page.click('#next-btn-0');
      await page.waitForTimeout(80);
      await clickAll(page, '#entry-body-1 .toggle-pair button[data-val="a"]');
      await page.click('#next-btn-1');
      await page.waitForTimeout(80);
      await clickAll(page, '#entry-body-2 .toggle-pair button[data-val="a"]');
      await page.click('#next-btn-2');
      await page.waitForTimeout(80);
      await clickAll(page, '#entry-body-3 .toggle-pair button[data-val="a"]');
      await page.click('#next-btn-3');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('%');
    },
  },
  {
    id: 'planning-fallacy',
    name: 'Ошибка планирования',
    async toEntryScreen(page) {
      await page.click('button:has-text("Вносить данные")');
    },
    async fill(page, opts = {}) {
      const inputs = await page.$$('#entry-body input');
      const rows = inputs.length / 2;
      const n = opts.count ?? rows;
      for (let i = 0; i < n; i++) {
        await inputs[i * 2].fill(String(3 + i));
        await inputs[i * 2 + 1].fill(String(6 + i * 2));
      }
      return n;
    },
    async toResults(page) {
      await page.click('button:has-text("Показать результаты")');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('×');
    },
  },
  {
    id: 'calibration',
    name: 'Калибровка уверенности',
    async toEntryScreen(page) {
      await page.click('button:has-text("Начать вопросы")');
    },
    async fill(page, opts = {}) {
      const inputs = await page.$$('#entry-body-0 input');
      const rows = inputs.length / 2;
      const n = opts.count ?? rows;
      for (let i = 0; i < n; i++) {
        await inputs[i * 2].fill(String(1990 + i));
        await inputs[i * 2 + 1].fill(String(2000 + i));
      }
      return n;
    },
    async toResults(page) {
      // #entry-body-N directly (N = question index), same reasoning as
      // availability's toResults() above — ".screen.active" matches
      // nothing now that every round is always in the DOM.
      await page.click('#next-btn-0');
      // the remaining questions (there are four by default): every range 0..5000
      for (let q = 1; q < 4; q++) {
        await page.waitForTimeout(80);
        const inputs = await page.$$(`#entry-body-${q} input`);
        for (let i = 0; i < inputs.length; i += 2) {
          await inputs[i].fill('0');
          await inputs[i + 1].fill('5000');
        }
        await page.click(`#next-btn-${q}`);
      }
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('%');
    },
  },
  {
    id: 'endowment',
    name: 'Эффект владения',
    hasRoles: true,
    // roles → lot 1 → lot 2 → lot 3 → the one entry screen with a price per lot
    async toEntryScreen(page) {
      await page.click('button:has-text("Распределить группы")');
      await page.waitForTimeout(80);
      await page.click('button:has-text("Лот 1")');
      await page.waitForTimeout(80);
      await page.click('#next-lot-0');
      await page.waitForTimeout(80);
      await page.click('#next-lot-1');
      await page.waitForTimeout(80);
      await page.click('#next-lot-2');
    },
    async fill(page, opts = {}) {
      // three inputs per person (mug, car, house), in row order
      const inputs = await page.$$('#entry-body input');
      const people = inputs.length / 3;
      const n = opts.count ?? people;
      const scale = [1, 2000, 15000];
      for (let i = 0; i < n; i++) {
        // owners ask more than buyers offer, like the real effect
        const owner = i < Math.ceil(people / 2);
        for (let lot = 0; lot < 3; lot++) {
          await inputs[i * 3 + lot].fill(
            String(Math.round((owner ? 700 : 400) * scale[lot] + i * 10)),
          );
        }
      }
      return n;
    },
    async toResults(page) {
      // every lot needs a seller AND a buyer price, so fill everyone
      await this.fill(page, {});
      await page.click('#next-btn');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('×');
    },
  },
  {
    id: 'framing',
    name: 'Эффект фрейминга',
    hasRoles: true,
    // roles → scenario 1 (project) → scenario 2 (release) → entry
    async toEntryScreen(page) {
      await page.click('button:has-text("Распределить группы")');
      await page.waitForTimeout(80);
      await page.click('button:has-text("Дальше")');
      await page.waitForTimeout(80);
      await page.click('#next-scenario-0');
      await page.waitForTimeout(80);
      await page.click('#next-scenario-1');
    },
    async fill(page, opts = {}) {
      const rows = await page.$$('#entry-body .team-entry-card');
      const n = opts.count ?? rows.length;
      // each person answers both scenarios
      for (let i = 0; i < n; i++) {
        for (const btn of await rows[i].$$('button[data-val="2"]')) await btn.click();
      }
      return n;
    },
    async toResults(page) {
      await page.click('button:has-text("Показать результаты")');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.length > 0;
    },
  },
  {
    id: 'prisoners-dilemma',
    name: 'Дилемма заключённого',
    hasRoles: true,
    async toEntryScreen(page) {
      await page.click('button:has-text("Распределить пары")');
      await page.waitForTimeout(80);
      await page.click('button:has-text("Дальше")');
    },
    async fill(page, opts = {}) {
      const cards = await page.$$('#entry-body-1 .pair-entry-card');
      const n = opts.count ?? cards.length;
      for (let i = 0; i < n; i++) {
        const toggles = await cards[i].$$('.toggle-pair');
        await (await toggles[0].$('button[data-val="C"]')).click();
        await (await toggles[1].$('button[data-val="D"]')).click();
      }
      return n;
    },
    async toResults(page) {
      await page.click('#next-btn-1');
      await page.waitForTimeout(80);
      await page.click('button:has-text("Раунд 2")');
      await page.waitForTimeout(80);
      const cards = await page.$$('#entry-body-2 .pair-entry-card');
      for (const c of cards) {
        const toggles = await c.$$('.toggle-pair');
        await (await toggles[0].$('button[data-val="C"]')).click();
        await (await toggles[1].$('button[data-val="C"]')).click();
      }
      await page.click('#next-btn-2');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('п.п.');
    },
  },
  {
    id: 'ultimatum',
    name: 'Ультиматум',
    hasRoles: true,
    async toEntryScreen(page) {
      await page.click('button:has-text("Распределить пары")');
      await page.waitForTimeout(80);
      await page.click('button:has-text("Дальше")');
    },
    async fill(page, opts = {}) {
      const inputs = await page.$$('#entry-body-1 input');
      const rows = inputs.length / 2;
      const n = opts.count ?? rows;
      for (let i = 0; i < n; i++) {
        await inputs[i * 2].fill(String(300 + i * 20));
        await inputs[i * 2 + 1].fill(String(200 + i * 10));
      }
      return n;
    },
    async toResults(page) {
      await page.click('#next-btn-1');
      await page.waitForTimeout(80);
      const inputs = await page.$$('#entry-body-2 input');
      for (let i = 0; i < inputs.length; i += 2) {
        await inputs[i].fill('400');
        await inputs[i + 1].fill('250');
      }
      await page.click('#next-btn-2');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('%');
    },
  },

  // ---------- the second batch (docs/new-games/) ----------
  {
    id: 'weakest-link',
    name: 'Слабое звено',
    async toEntryScreen(page) {
      await page.click('button:has-text("Раунд 1")');
    },
    async fill(page, opts = {}) {
      return pickInRows(page, '[data-testid="entry-body-1"] .entry-row', (i) => i % 7, opts.count);
    },
    async toResults(page) {
      await page.click('[data-testid="next-btn-1"]');
      for (let screen = 2; screen <= 5; screen++) {
        await page.waitForTimeout(80);
        await pickInRows(
          page,
          `[data-testid="entry-body-${screen}"] .entry-row`,
          (i) => (i + screen) % 7,
        );
        await page.click(`[data-testid="next-btn-${screen}"]`);
      }
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('→');
    },
  },
  {
    id: 'volunteer',
    name: 'Кто возьмёт на себя',
    async toEntryScreen(page) {
      await page.click('button:has-text("Раунд 1")');
    },
    async fill(page, opts = {}) {
      return pickInRows(
        page,
        '[data-testid^="entry-body-1-"] .entry-row',
        (i) => i % 2,
        opts.count,
      );
    },
    async toResults(page) {
      await page.click('[data-testid="next-btn-1"]');
      for (let screen = 2; screen <= 3; screen++) {
        await page.waitForTimeout(80);
        await pickInRows(page, `[data-testid^="entry-body-${screen}-"] .entry-row`, (i) =>
          i % 3 ? 1 : 0,
        );
        await page.click(`[data-testid="next-btn-${screen}"]`);
      }
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('%');
    },
  },
  {
    id: 'hidden-profile',
    name: 'Скрытый профиль',
    async toEntryScreen(page) {
      await page.click('[data-testid="next-btn-0"]');
      await page.waitForTimeout(80);
      await page.click('[data-testid="next-btn-1"]');
    },
    async fill(page, opts = {}) {
      return pickInRows(page, '[data-testid="entry-body-2"] .entry-row', (i) => i % 3, opts.count);
    },
    async toResults(page) {
      await page.click('[data-testid="next-btn-2"]');
      await page.waitForTimeout(80);
      await page.click('#round-3 .toggle-pair button:has-text("Саша")');
      await page.click('[data-testid="next-btn-3"]');
      await page.waitForTimeout(80);
      await page.click('[data-testid="next-btn-4"]');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('Саша');
    },
  },
  {
    id: 'dollar-auction',
    name: 'Долларовый аукцион',
    async toEntryScreen(page) {
      await page.click('button:has-text("К торгам")');
    },
    // two people escalate: 10, 20, … — 12 bids by default, past the prize of 100
    async fill(page, opts = {}) {
      const n = opts.count ?? 12;
      for (let i = 0; i < n; i++) {
        const buttons = await page.$$('[data-testid="bid-buttons"] button');
        await buttons[i % 2].click();
      }
      return n;
    },
    async toResults(page) {
      await page.click('[data-testid="next-btn-1"]');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('за 100');
    },
    // the draft is the bid log: restored, the board shows a leading bid again
    async restored(page) {
      const board = await page.textContent('.board');
      return /\d/.test(board.split('лидер')[0]);
    },
  },
  {
    id: 'lemons',
    name: 'Рынок «лимонов»',
    hasRoles: true,
    async toEntryScreen(page) {
      await page.click('button:has-text("Распределить роли")');
      await page.waitForTimeout(80);
      await page.click('[data-testid="next-btn-1"]');
    },
    async fill(page, opts = {}) {
      return fillInputs(
        page,
        '#round-2 .entry-row.number-choice input',
        (i) => 40 + i * 7,
        opts.count,
      );
    },
    async toResults(page) {
      for (let screen = 2; screen <= 5; screen++) {
        await page.waitForTimeout(80);
        if (screen > 2)
          await fillInputs(
            page,
            `#round-${screen} .entry-row.number-choice input`,
            (i) => 30 + i * 9,
          );
        // every buyer in the queue takes the cheapest lot left (or passes when none)
        for (let k = 0; k < 30; k++) {
          const options = await page.$$(`#round-${screen} .round-recap .bid-buttons button`);
          if (!options.length) break;
          await options[0].click();
        }
        await page.click(`[data-testid="reveal-btn-${screen}"]`);
        await page.waitForTimeout(60);
        await page.click(`[data-testid="next-btn-${screen}"]`);
      }
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('→');
    },
  },
  {
    id: 'beauty-contest',
    name: 'Угадай ⅔ от среднего',
    async toEntryScreen(page) {
      await page.click('button:has-text("Раунд 1")');
    },
    async fill(page, opts = {}) {
      return fillInputs(page, '[data-testid="entry-body-1"] input', (i) => 10 + i * 5, opts.count);
    },
    async toResults(page) {
      await page.click('[data-testid="next-btn-1"]');
      for (let screen = 2; screen <= 4; screen++) {
        await page.waitForTimeout(80);
        await fillInputs(
          page,
          `[data-testid="entry-body-${screen}"] input`,
          (i) => 30 - screen * 5 + i,
        );
        await page.click(`[data-testid="next-btn-${screen}"]`);
      }
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('→');
    },
  },
  {
    id: 'el-farol',
    name: 'Бар «Эль Фароль»',
    async toEntryScreen(page) {
      await page.click('button:has-text("Вечер 1")');
    },
    // everyone is "Дома" by default — tap "Иду" for every other person
    async fill(page, opts = {}) {
      const rows = await page.$$('[data-testid="entry-body-1"] .entry-row');
      const n = opts.count ?? rows.length;
      for (let i = 0; i < n; i += 2) await (await rows[i].$$('button'))[0].click();
      return n;
    },
    async toResults(page) {
      await page.click('[data-testid="next-btn-1"]');
      for (let screen = 2; screen <= 8; screen++) {
        await page.waitForTimeout(60);
        const rows = await page.$$(`[data-testid="entry-body-${screen}"] .entry-row`);
        for (let i = screen % 3; i < rows.length; i += 3)
          await (await rows[i].$$('button'))[0].click();
        await page.click(`[data-testid="next-btn-${screen}"]`);
      }
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('из 8');
    },
  },
  {
    id: 'beer-game',
    name: 'Пивная игра',
    hasRoles: true,
    async toEntryScreen(page) {
      await page.click('[data-testid="next-btn-0"]');
      await page.waitForTimeout(80);
      await page.click('[data-testid="next-btn-1"]');
    },
    // opts.count = how many weeks to play (all 24 by default); a mild panic upstream
    async fill(page, opts = {}) {
      const n = opts.count ?? 24;
      for (let w = 0; w < n; w++) {
        const inputs = await page.$$('[data-testid="orders-row"] input');
        const surge = w >= 4 && w < 10 ? 2 : 0;
        for (let i = 0; i < 4; i++) await inputs[i].fill(String(w < 4 ? 4 : 8 + surge * i));
        await page.click('[data-testid="week-btn"]');
      }
      return n;
    },
    async toResults(page) {
      await page.click('[data-testid="next-btn-2"]');
      await page.waitForTimeout(80);
      const rows = await page.$$('#round-3 .entry-row');
      for (let i = 0; i < rows.length; i++) {
        await (await rows[i].$('input')).fill(String(10 + i));
        await (await rows[i].$$('.toggle-pair button'))[i % 4].click();
      }
      await page.click('[data-testid="next-btn-3"]');
      await page.waitForTimeout(80);
      await page.click('[data-testid="next-btn-4"]');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.startsWith('×');
    },
    // the draft is the orders: restored, the game is back at the week after them
    async restored(page) {
      const eyebrow = await page.textContent('#round-2 .eyebrow');
      return !eyebrow.includes('Неделя 1 ');
    },
  },
];

// Clicks button number pick(i) in each of the first `count` rows (all by default).
async function pickInRows(page, rowSelector, pick, count) {
  const rows = await page.$$(rowSelector);
  const n = count ?? rows.length;
  for (let i = 0; i < n; i++) await (await rows[i].$$('button'))[pick(i)].click();
  return n;
}

async function fillInputs(page, selector, value, count) {
  const inputs = await page.$$(selector);
  const n = count ?? inputs.length;
  for (let i = 0; i < n; i++) await inputs[i].fill(String(value(i)));
  return n;
}

module.exports = { GAMES };
