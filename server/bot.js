/* =========================================================
   BOT — Telegram Bot API: webhook, /start, Mini App buttons
   =========================================================
   Without BOT_TOKEN this module is inert (local dev). With one:
     - on boot it registers the webhook at PUBLIC_URL + /bot
       (with a secret token so only Telegram can post there);
     - /start answers with a button that opens the Mini App —
       carrying the session code if the user started the bot with
       one (/start SESSIONID), so a shared link works even outside
       the t.me deep-link form.
   Sending private "раздача" messages to participants arrives in
   Этап 2 — the API helper below is the seam it will use.
========================================================= */
import { config, isTelegramConfigured } from './config.js';

const webhookSecret = () => process.env.BOT_WEBHOOK_SECRET ?? '';
const apiUrl = (method) => `https://api.telegram.org/bot${config.botToken}/${method}`;

async function botApi(method, payload) {
  const res = await fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Bot API ${method}: HTTP ${res.status}`);
  }
  return res.json();
}

// POST /bot — called by Telegram. Returns true if the update was handled.
export async function handleBotUpdate(req) {
  if (!isTelegramConfigured()) return false;
  if (webhookSecret()) {
    if (req.headers.get('x-telegram-bot-api-secret-token') !== webhookSecret()) return false;
  }
  let update;
  try {
    update = await req.json();
  } catch {
    return false;
  }

  const message = update.message ?? update.edited_message;
  const text = message?.text ?? '';
  if (!message || !text.startsWith('/start')) return true; // other update types: acknowledged, ignored

  const chatId = message.chat.id;
  const param = text.trim().split(/\s+/)[1]?.toUpperCase() ?? '';
  const appUrl = param
    ? `${config.publicUrl}/?join=${encodeURIComponent(param)}`
    : config.publicUrl;

  await botApi('sendMessage', {
    chat_id: chatId,
    text: param
      ? 'Это сессия «5 минут общего развития». Нажмите кнопку — откроется приложение, ответы уходят ведущему автоматически.'
      : '«5 минут общего развития» — мини-эксперименты для командной встречи. Ведущий создаёт сессию в приложении, участники заходят по его ссылке.',
    reply_markup: {
      inline_keyboard: [[{ text: 'Открыть приложение', web_app: { url: appUrl } }]],
    },
  });
  return true;
}

// Best-effort webhook registration on boot; the server works (locally)
// without it.
export async function registerWebhook() {
  if (!isTelegramConfigured()) return;
  try {
    await botApi('setWebhook', {
      url: `${config.publicUrl}/bot`,
      secret_token: webhookSecret() || undefined,
      allowed_updates: ['message'],
    });
    console.log(`[bot] webhook: ${config.publicUrl}/bot`);
  } catch (err) {
    console.warn(`[bot] setWebhook failed: ${err.message}`);
  }
}

// A private text to one participant ("раздача в личку"). Returns true
// when Telegram accepted the message; without a configured bot (local
// dev) it is a no-op returning false — the ws layer then shows the
// texts on the facilitator's screen instead.
export async function sendDirectMessage(tgId, text) {
  if (!isTelegramConfigured()) return false;
  try {
    await botApi('sendMessage', { chat_id: tgId, text });
    return true;
  } catch (err) {
    console.warn(`[bot] sendMessage → ${tgId} failed: ${err.message}`);
    return false;
  }
}
