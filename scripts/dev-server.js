// scripts/dev-server.js
// Serves src/ over plain HTTP so its <script type="module"> can
// resolve relative imports normally. Phase 1 of the modernization
// migration (docs/modernization-plan.md) turned every src/*.js file
// into a real ES module, so src/index.html can no longer just be
// double-clicked and opened via file:// — browsers refuse to load
// module imports over file:// (treated as cross-origin), even though
// they're fine with classic, non-module <script src>/<link> over
// file:// (which is what let src/index.html be opened directly
// before). This tiny static server is the replacement dev workflow.
//
// Since then, the games and home.js started importing `lit` — a bare
// specifier ("import { LitElement } from 'lit'") — which only a
// bundler or an import map can resolve; a browser fetching src/*.js
// as plain static files has no way to turn "lit" into a URL. So this
// server can't just hand src/app.js to the browser as-is: it runs
// src/app.js through Bun.build() (the same bundler build.js uses for
// the dist/ deliverable, just unminified and with an inline
// sourcemap) on every request for /app.js, resolving `lit` and every
// relative import into one plain-ESM response. Everything else
// (styles.css, index.html, static assets) is still served byte for
// byte from src/.
//
// Usage: bun run dev   (then open http://localhost:5173)
//
// dist/index.html (the actual deliverable) is unaffected by any of
// this — build.js inlines the whole bundled module graph as literal
// text inside one <script type="module"> tag, so there's no separate
// file fetch for the browser to block, and this file never touches
// build.js or dist/.

const PORT = 5173;
const ROOT = new URL('../src/', import.meta.url);
const APP_ENTRY = new URL('app.js', ROOT).pathname;

async function bundleApp() {
  const result = await Bun.build({
    entrypoints: [APP_ENTRY],
    sourcemap: 'inline',
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error('Bun.build failed for src/app.js');
  }
  return result.outputs[0].text();
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;

    if (pathname === '/app.js') {
      try {
        const js = await bundleApp();
        return new Response(js, { headers: { 'Content-Type': 'text/javascript' } });
      } catch (err) {
        console.error(err);
        return new Response(String(err), { status: 500 });
      }
    }

    const file = Bun.file(new URL('.' + pathname, ROOT));
    if (await file.exists()) return new Response(file);
    return new Response('Not found', { status: 404 });
  },
});

console.log(
  `Dev server: http://localhost:${PORT}  (serving src/, bundling app.js+lit on the fly, Ctrl+C to stop)`,
);
