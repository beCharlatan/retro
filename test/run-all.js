// test/run-all.js
// Runs every *.spec.js suite in this folder against the CURRENT
// dist/index.html, prints one combined summary, and exits non-zero if
// anything failed — so it plugs into any CI/pre-commit hook as-is.
//
// Usage:
//   bun run build && bun run test
//   bun test/run-all.js --only=persistence,export

const path = require('node:path');

const ALL_SUITES = [
  'smoke',
  'home',
  'persistence',
  'export',
  'swap',
  'copy',
  'trio',
  'custom-question',
  'timer',
  'exit-dialog',
  'chart-tip',
];

function parseOnly() {
  const arg = process.argv.find((a) => a.startsWith('--only='));
  if (!arg) return ALL_SUITES;
  const requested = arg
    .split('=')[1]
    .split(',')
    .map((s) => s.trim());
  return ALL_SUITES.filter((s) => requested.includes(s));
}

async function main() {
  const suites = parseOnly();
  const start = Date.now();
  let totalPassed = 0;
  let totalFailed = 0;
  const allFailures = [];

  console.log(`Running ${suites.length} suite(s) against dist/index.html: ${suites.join(', ')}`);

  for (const name of suites) {
    const mod = require(path.join(__dirname, `${name}.spec.js`));
    const report = await mod.run();
    totalPassed += report.passed;
    totalFailed += report.failed;
    report.failures.forEach((f) => {
      allFailures.push(`[${name}] ${f.label}${f.detail ? `: ${f.detail}` : ''}`);
    });
  }

  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\n${'='.repeat(50)}`);
  console.log(`TOTAL: ${totalPassed} passed, ${totalFailed} failed  (${seconds}s)`);
  if (totalFailed > 0) {
    console.log('\nFailures:');
    allFailures.forEach((f) => {
      console.log(`  - ${f}`);
    });
  }
  console.log('='.repeat(50));

  process.exit(totalFailed === 0 ? 0 : 1);
}

main();
