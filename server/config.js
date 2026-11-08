/* =========================================================
   SERVER CONFIG — everything the server needs comes from env
   =========================================================
   Required in production (Telegram):
     BOT_TOKEN       — from @BotFather
     PUBLIC_URL      — https://<domain> the server is reachable at
                       (Mini App URL + webhook target)
     BOT_USERNAME    — bot login without @ (t.me/<username>)
     APP_SHORT_NAME  — Mini App short name (t.me/<bot>/<short>)

   Everything has a dev fallback so `bun server/index.js` runs
   locally without Telegram: without BOT_TOKEN auth accepts a
   declared dev user, the bot module stays silent, and deep links
   point at the local dev page instead of t.me.
========================================================= */

import { join } from 'node:path';

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8787),
  dbPath: env.DB_PATH ?? join(import.meta.dir, 'data', 'retro.db'),

  // Telegram
  botToken: env.BOT_TOKEN ?? '',
  publicUrl: env.PUBLIC_URL ?? `http://localhost:${Number(env.PORT ?? 8787)}`,
  botUsername: env.BOT_USERNAME ?? '',
  appShortName: env.APP_SHORT_NAME ?? 'app',

  // How long an untouched session lives before it can be GC'd.
  sessionTtlHours: Number(env.SESSION_TTL_HOURS ?? 24),
};

export const isTelegramConfigured = () => Boolean(config.botToken);

export const joinDeepLink = (sessionId) =>
  isTelegramConfigured() && config.botUsername && config.appShortName
    ? `https://t.me/${config.botUsername}/${config.appShortName}?startapp=${sessionId}`
    : `${config.publicUrl}/?join=${sessionId}`;
