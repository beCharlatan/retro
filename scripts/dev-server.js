// scripts/dev-server.js
// Serves src/ over plain HTTP so its <script type="module"> can
// resolve relative imports normally. Now that Phase 1 of the
// modernization migration (docs/modernization-plan.md) turned every
// src/*.js file into a real ES module, src/index.html can no longer
// just be double-clicked and opened via file:// — browsers refuse to
// load module imports over file:// (treated as cross-origin), even
// though they're fine with classic, non-module <script src>/<link>
// over file:// (which is what let src/index.html be opened directly
// before). This tiny static server is the replacement dev workflow.
//
// Usage: bun run dev   (then open http://localhost:5173)
//
// dist/index.html (the actual deliverable) is unaffected by any of
// this — build.js inlines the whole bundled module graph as literal
// text inside one <script type="module"> tag, so there's no separate
// file fetch for the browser to block.

const PORT = 5173;
const ROOT = new URL('../src/', import.meta.url);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = Bun.file(new URL('.' + pathname, ROOT));
    if (await file.exists()) return new Response(file);
    return new Response('Not found', { status: 404 });
  },
});

console.log(`Dev server: http://localhost:${PORT}  (serving src/, Ctrl+C to stop)`);
