// Playwright Test config — used ONLY for the visual-regression suite in
// test/visual/. The rest of the E2E suite is the lightweight custom runner
// (test/run-all.js); this one exists because toMatchSnapshot / image
// comparison ships with the @playwright/test runner.
//
//   bun run test:visual            compare against the committed baselines
//   bun run test:visual:update     re-record them after an intentional change
//
// Baselines are per platform (system fonts differ between macOS and Linux,
// which changes text rendering): test/visual/__snapshots__/<platform>/.
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'test/visual',
  snapshotPathTemplate: '{testDir}/__snapshots__/{platform}/{arg}{ext}',
  timeout: 60_000,
  workers: 1, // deterministic order and no CPU contention while rendering
  reporter: [['list']],
  expect: {
    // A tolerance for sub-pixel anti-aliasing noise, not for real changes.
    toMatchSnapshot: { maxDiffPixelRatio: 0.004, threshold: 0.2 },
  },
  use: {
    viewport: { width: 1000, height: 1300 },
    reducedMotion: 'reduce',
    deviceScaleFactor: 1,
  },
});
