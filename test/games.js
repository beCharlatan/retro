// test/games.js
// One entry per game, encoding exactly how to drive it through
// Playwright: reach the data-entry screen, fill some/all fields, move
// to results, and sanity-check what rendered. Reused by smoke.spec.js,
// persistence.spec.js and pdf.spec.js so none of them have to know the
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
      await page.click('text=Вносить данные →');
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
      await page.click('text=Показать результаты →');
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
      await page.click('text=Вносить данные →');
    },
    async fill(page, opts = {}) {
      const inputs = await page.$$('#entry-body input');
      const n = opts.count ?? inputs.length;
      for (let i = 0; i < n; i++) await inputs[i].fill(String(300 + i * 10));
      return n;
    },
    async toResults(page) {
      await page.click('text=Показать результаты →');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('420');
    },
  },
  {
    id: 'dictator',
    name: 'Игра диктатора',
    multiScreen: true,
    // First game migrated to a Lit/Shadow DOM custom element (see
    // docs/modernization-plan.md Phase 2) — selectors here use
    // data-testid instead of id, per that migration's decision (CSS
    // Modules would hash class names, so tests shouldn't depend on
    // them; ids still work fine but data-testid is the deliberate,
    // consistent hook going forward). Playwright's CSS engine pierces
    // open shadow roots automatically for these, same as for ids/classes.
    async toEntryScreen(page) {
      await page.click('text=Раунд 1 →');
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
    multiScreen: true,
    // Shadow DOM Lit component (docs/modernization-plan.md Phase 3) —
    // data-testid instead of id, same as dictator's pilot.
    async toEntryScreen(page) {
      await page.click('text=Раунд 1 →');
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
      await page.click('text=Вносить данные →');
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
      await page.click('text=Показать результаты →');
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
      await page.click('text=Вносить данные →');
    },
    async fill(page, opts = {}) {
      const inputs = await page.$$('#entry-body input');
      const n = opts.count ?? inputs.length;
      for (let i = 0; i < n; i++) await inputs[i].fill(String(i % 6));
      return n;
    },
    async toResults(page) {
      await page.click('text=Показать результаты →');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('/ 5');
    },
  },
  {
    id: 'availability',
    name: 'Эвристика доступности',
    multiScreen: true,
    async toEntryScreen(page) {
      await page.click('text=Начать вопросы →');
    },
    async fill(page, opts = {}) {
      const rows = await page.$$('#entry-body-0 .entry-row');
      const n = opts.count ?? rows.length;
      for (let i = 0; i < n; i++) await (await rows[i].$('button[data-val="a"]')).click();
      return n;
    },
    async toResults(page) {
      await page.click('#next-btn-0');
      await page.waitForTimeout(80);
      await clickAll(page, '.screen.active .toggle-pair button[data-val="a"]');
      await page.click('#next-btn-1');
      await page.waitForTimeout(80);
      await clickAll(page, '.screen.active .toggle-pair button[data-val="a"]');
      await page.click('#next-btn-2');
      await page.waitForTimeout(80);
      await clickAll(page, '.screen.active .toggle-pair button[data-val="a"]');
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
      await page.click('text=Вносить данные →');
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
      await page.click('text=Показать результаты →');
    },
    async verifyResults(page) {
      const n = await page.textContent('.reveal .n');
      return n.includes('×');
    },
  },
  {
    id: 'calibration',
    name: 'Калибровка уверенности',
    multiScreen: true,
    async toEntryScreen(page) {
      await page.click('text=Начать вопросы →');
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
      await page.click('#next-btn-0');
      await page.waitForTimeout(80);
      let inputs = await page.$$('.screen.active input');
      for (let i = 0; i < inputs.length; i += 2) {
        await inputs[i].fill('5000');
        await inputs[i + 1].fill('6000');
      }
      await page.click('#next-btn-1');
      await page.waitForTimeout(80);
      inputs = await page.$$('.screen.active input');
      for (let i = 0; i < inputs.length; i += 2) {
        await inputs[i].fill('3000');
        await inputs[i + 1].fill('4000');
      }
      await page.click('#next-btn-2');
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
    multiScreen: true,
    async toEntryScreen(page) {
      await page.click('text=Распределить группы →');
      await page.waitForTimeout(80);
      await page.click('text=Дальше →');
    },
    async fill(page, opts = {}) {
      const inputs = await page.$$('#entry-body-1 input');
      const n = opts.count ?? inputs.length;
      for (let i = 0; i < n; i++) await inputs[i].fill(String(200 + i * 15));
      return n;
    },
    async toResults(page) {
      await page.click('#next-btn-1');
      await page.waitForTimeout(80);
      const inputs = await page.$$('#entry-body-2 input');
      for (let i = 0; i < inputs.length; i++) await inputs[i].fill(String(100 + i * 10));
      await page.click('#next-btn-2');
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
    async toEntryScreen(page) {
      await page.click('text=Распределить группы →');
      await page.waitForTimeout(80);
      await page.click('text=Дальше →');
      await page.waitForTimeout(80);
      await page.click('text=Вносить данные →');
    },
    async fill(page, opts = {}) {
      const rows = await page.$$('#entry-body .team-entry-card');
      const n = opts.count ?? rows.length;
      for (let i = 0; i < n; i++) await (await rows[i].$('button[data-val="2"]')).click();
      return n;
    },
    async toResults(page) {
      await page.click('text=Показать результаты →');
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
    multiScreen: true,
    async toEntryScreen(page) {
      await page.click('text=Распределить пары →');
      await page.waitForTimeout(80);
      await page.click('text=Дальше →');
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
      await page.click('text=Раунд 2 →');
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
    multiScreen: true,
    async toEntryScreen(page) {
      await page.click('text=Распределить пары →');
      await page.waitForTimeout(80);
      await page.click('text=Дальше →');
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
];

module.exports = { GAMES };
