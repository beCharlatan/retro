// Bundles src/ (styles.css + the real ESM module graph rooted at
// src/app.js — see docs/modernization-plan.md Phase 1) into one
// self-contained dist/index.html — a single file that opens directly
// in Chrome/Safari via double-click, no server or build step needed
// on the recipient's side.
//
// Usage: bun run build  (or: bun build.js)
//
// Requires the Bun runtime specifically, not plain node — this calls
// Bun.build(), Bun's own bundler, which resolves every relative
// import starting from src/app.js (all 13 games, the 5 shared
// patterns, state/toast/home/router/privacy-mask) into one JS bundle,
// and does the same for styles.css into one CSS bundle. Both get
// inlined into the HTML template below exactly like the pre-ESM
// build.js used to inline hand-concatenated source — the output
// shape (one flat dist/index.html) hasn't changed, only how the JS
// gets assembled has.

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');

async function bundle(entrypoint) {
  const result = await Bun.build({
    entrypoints: [entrypoint],
    minify: true,
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`Bun.build failed for ${entrypoint}`);
  }
  return result.outputs[0].text();
}

async function main() {
  const css = await bundle(path.join(SRC, 'styles.css'));
  const js = await bundle(path.join(SRC, 'app.js'));

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>5 минут общего развития</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<div id="toast"></div>

<script type="module">
${js}
</script>
</body>
</html>
`;

  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf-8');

  console.log('Built dist/index.html  (bundled with Bun.build from src/app.js + src/styles.css)');
}

main();
