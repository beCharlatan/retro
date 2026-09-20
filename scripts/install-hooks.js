// scripts/install-hooks.js
// Copies scripts/pre-push into .git/hooks/pre-push and makes it
// executable, so `git push` runs the fast local smoke check too —
// not just CI. Run once after cloning (or automatically via
// `bun install`'s postinstall hook, see package.json):
//
//   bun run install-hooks
//
// Fails silently (just a warning, not an error) outside a git repo —
// e.g. when the package is installed from a tarball rather than
// cloned — so it never breaks a plain `bun install`.

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

try {
  const root = execSync('git rev-parse --show-toplevel', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
  const hooksDir = path.join(root, '.git', 'hooks');
  const src = path.join(root, 'scripts', 'pre-push');
  const dest = path.join(hooksDir, 'pre-push');

  if (!fs.existsSync(hooksDir)) {
    console.log('install-hooks: no .git/hooks directory found — skipping (not a git checkout?)');
    process.exit(0);
  }

  fs.copyFileSync(src, dest);
  fs.chmodSync(dest, 0o755);
  console.log(`install-hooks: pre-push hook installed -> ${dest}`);
} catch {
  console.log('install-hooks: skipped (not inside a git repository)');
}
