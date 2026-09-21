// Runs the visual-regression suite (bun run test:visual) only if baselines for
// THIS platform are committed (test/visual/__snapshots__/<platform>/). System
// fonts render differently on macOS and Linux, so a macOS baseline can't be
// compared against a Linux render — without this the CI job would fail on every
// run instead of being skipped until Linux baselines exist.
//
// Record them once with `bun run test:visual:update` on that platform (or the
// "record-visual-baselines" manual run of the CI workflow) and commit them.

import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dir, '..', 'test', 'visual', '__snapshots__', process.platform);
const hasBaselines = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('.png'));

if (!hasBaselines) {
  console.log(
    `No visual baselines for platform "${process.platform}" in ${path.relative(process.cwd(), dir)} — skipping.\n` +
      'Record them with `bun run test:visual:update` on this platform and commit the PNGs.',
  );
  process.exit(0);
}

const proc = Bun.spawnSync(['bun', 'run', 'test:visual'], { stdout: 'inherit', stderr: 'inherit' });
process.exit(proc.exitCode ?? 1);
