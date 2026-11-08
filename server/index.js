/* =========================================================
   SERVER ENTRY — Bun.serve: static clients + bot webhook + WS
   =========================================================
   Runs the whole online mode in one process:
     - serves the built Mini App (server/public/index.html) at / and
       the projector page (server/public/projector.html) at /projector
       — build them with `bun run build:tma`;
     - POST /bot — Telegram webhook (server/bot.js);
     - /ws — the WebSocket endpoint the Mini App and projector use.

   Local dev without Telegram: no BOT_TOKEN → auth accepts the dev
   envelope (`{"dev":true,"user":{...}}`) and deep links point at
   http://localhost:PORT/?join=<code>.
========================================================= */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { handleBotUpdate, registerWebhook } from './bot.js';
import { config } from './config.js';
import { gcSessions } from './db.js';
import { Hub, handleMessage } from './ws.js';

const hub = new Hub();

const TMA_FILE = join(import.meta.dir, 'public', 'index.html');
const PROJECTOR_FILE = join(import.meta.dir, 'public', 'projector.html');

const missingBuild = new Response(
  'Клиенты не собраны. Выполните `bun run build:tma` и перезапустите сервер.',
  { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } },
);

function serveFile(path, type) {
  if (!existsSync(path)) return missingBuild;
  return new Response(Bun.file(path), { headers: { 'content-type': type } });
}

Bun.serve({
  port: config.port,
  fetch(req, srv) {
    const url = new URL(req.url);

    if (url.pathname === '/ws') {
      const upgraded = srv.upgrade(req);
      if (upgraded) return undefined;
      return new Response('WebSocket expected', { status: 400 });
    }

    if (url.pathname === '/bot' && req.method === 'POST') {
      return handleBotUpdate(req).then((ok) =>
        ok ? Response.json({ ok: true }) : new Response('forbidden', { status: 403 }),
      );
    }

    if (url.pathname === '/healthz') return Response.json({ ok: true });

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      return serveFile(TMA_FILE, 'text/html; charset=utf-8');
    }
    if (req.method === 'GET' && url.pathname === '/projector') {
      return serveFile(PROJECTOR_FILE, 'text/html; charset=utf-8');
    }

    return new Response('not found', { status: 404 });
  },
  websocket: {
    open(ws) {
      // First message must be auth; the socket isn't in any room yet.
      ws.data = {};
    },
    message(ws, raw) {
      handleMessage(hub, ws, typeof raw === 'string' ? raw : raw.toString());
    },
    close(ws) {
      hub.remove(ws);
    },
  },
});

gcSessions();
setInterval(gcSessions, 3600_000).unref();
registerWebhook();

console.log(`[retro] online mode: ${config.publicUrl} (ws: /ws, projector: /projector)`);
