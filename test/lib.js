// test/lib.js
// Shared helpers for the retro regression suite. Kept dependency-light
// (just Playwright) so the whole suite runs with a single `node` command
// and no test framework to install.

const path = require('node:path');
const { chromium } = require('playwright');

const DIST_PATH = path.join(__dirname, '..', 'dist', 'index.html');
const DIST_URL = 'file://' + DIST_PATH;

// Collects failures across the whole run so run-all.js can print one
// summary and exit non-zero if anything broke.
class Report {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.failures = [];
  }
  ok(label) {
    this.passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + label);
  }
  fail(label, detail) {
    this.failed++;
    this.failures.push({ label, detail });
    console.log('  \x1b[31m✗\x1b[0m ' + label + (detail ? '  — ' + detail : ''));
  }
  check(label, condition, detail) {
    if (condition) this.ok(label);
    else this.fail(label, detail);
  }
  section(title) {
    console.log('\n' + title);
  }
  summary() {
    const total = this.passed + this.failed;
    console.log('\n' + '─'.repeat(50));
    if (this.failed === 0) {
      console.log(`\x1b[32mAll ${total} checks passed.\x1b[0m`);
    } else {
      console.log(`\x1b[31m${this.failed} of ${total} checks failed:\x1b[0m`);
      this.failures.forEach((f) => {
        console.log(`  - ${f.label}${f.detail ? ': ' + f.detail : ''}`);
      });
    }
    return this.failed === 0;
  }
}

// Opens a fresh page against dist/index.html, wired to fail the report on
// any uncaught JS error or console.error (excluding the expected 403 from
// Google Fonts, which has no network access in this sandbox).
async function openPage(browser, report, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1000, height: 1300 } });
  page.on('pageerror', (e) => report.fail('no uncaught JS errors', String(e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('403')) {
      report.fail('no console errors', msg.text());
    }
  });
  await page.goto(DIST_URL);
  return page;
}

async function withBrowser(fn) {
  const browser = await chromium.launch();
  try {
    await fn(browser);
  } finally {
    await browser.close();
  }
}

module.exports = { DIST_PATH, DIST_URL, Report, openPage, withBrowser };
