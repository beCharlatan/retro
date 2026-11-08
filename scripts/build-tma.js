// Bundles the online-mode clients (clients/tma, clients/projector)
// into two self-contained files under server/public/ — the server
// (server/index.js) serves them as-is. Same single-file shape as the
// offline dist: CSS and JS inlined, no requests beyond the WebSocket.
//
// Usage: bun run build:tma  (or: bun scripts/build-tma.js)

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'server', 'public');

async function bundleJs(entrypoint) {
  const result = await Bun.build({ entrypoints: [entrypoint], minify: true });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`Bun.build failed for ${entrypoint}`);
  }
  return result.outputs[0].text();
}

function page({ title, css, js, body }) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${title}</title>
<style>
${css}
</style>
</head>
<body>
${body}
<script type="module">
${js}
</script>
</body>
</html>
`;
}

async function main() {
  const tmaCss = fs.readFileSync(path.join(ROOT, 'clients/tma/tma.css'), 'utf-8');
  const projectorCss = fs.readFileSync(path.join(ROOT, 'clients/projector/projector.css'), 'utf-8');

  const tmaJs = await bundleJs(path.join(ROOT, 'clients/tma/app.js'));
  const projectorJs = await bundleJs(path.join(ROOT, 'clients/projector/projector.js'));

  fs.mkdirSync(OUT, { recursive: true });

  fs.writeFileSync(
    path.join(OUT, 'index.html'),
    page({
      title: '5 минут общего развития',
      css: tmaCss,
      js: tmaJs,
      body: '<main id="app" aria-live="polite"></main>',
    }),
    'utf-8',
  );

  fs.writeFileSync(
    path.join(OUT, 'projector.html'),
    page({
      title: 'Экран для показа — 5 минут общего развития',
      css: `${tmaCss}\n${projectorCss}`,
      js: projectorJs,
      body: '<main id="app" aria-live="polite"></main>',
    }),
    'utf-8',
  );

  console.log(
    'Built server/public/index.html (Mini App) and server/public/projector.html (экран для показа)',
  );
}

main();
