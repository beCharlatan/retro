// Bundles src/ (styles.css + games/*.js + app.js) into one self-contained
// dist/index.html — a single file that opens directly in Chrome/Safari via
// double-click, no server or build step needed on the recipient's side.
//
// Usage: bun run build  (or: bun build.js / node build.js)

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
const GAMES_DIR = path.join(SRC, 'games');

function read(p) {
  return fs.readFileSync(p, 'utf-8');
}

const css = read(path.join(SRC, 'styles.css')).trim();

const rolesJs = read(path.join(SRC, 'roles.js')).trim();
const screenJs = read(path.join(SRC, 'screen.js')).trim();
const persistJs = read(path.join(SRC, 'persist.js')).trim();
const chartTipJs = read(path.join(SRC, 'chart-tip.js')).trim();
const printJs = read(path.join(SRC, 'print.js')).trim();

const gameFiles = fs
  .readdirSync(GAMES_DIR)
  .filter((f) => f.endsWith('.js'))
  .sort();
const gamesJs = gameFiles.map((f) => read(path.join(GAMES_DIR, f)).trim()).join('\n\n');

const appJs = read(path.join(SRC, 'app.js')).trim();

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>5 минут общего развития</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500;600;700&family=Fraunces:ital,wght@0,500;0,600;0,700;1,500;1,600&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<div id="toast"></div>

<script>
${rolesJs}

${screenJs}

${persistJs}

${chartTipJs}

${printJs}

${gamesJs}

${appJs}
</script>
</body>
</html>
`;

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf-8');

console.log(`Built dist/index.html  (${gameFiles.length} game module(s): ${gameFiles.join(', ')})`);
