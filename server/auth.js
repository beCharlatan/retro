/* =========================================================
   AUTH — validating Telegram WebApp initData
   =========================================================
   initData is a query string the Telegram client hands the Mini App;
   its `hash` field is HMAC-SHA256 of the sorted key=value pairs over
   a key derived from the bot token (Telegram docs, "Validating data
   received via the Mini App"). Without a configured bot token (local
   dev) a self-declared `dev` user is accepted instead — never in
   production, where there is a token to check against.

   Returns the authenticated user or null.
========================================================= */
import { config } from './config.js';

const isText = (v) => typeof v === 'string';

// Dev-user id: stable per name so several `?dev=Имя` tabs are distinct
// people (tgId is the session-wide identity key).
function stableDevId(name) {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) >>> 0;
  return 100_000_000 + (h % 800_000_000);
}

export function validateInitData(initData) {
  if (!isText(initData)) return null;

  // Dev mode: no bot configured → accept the debug envelope.
  if (!config.botToken) {
    try {
      const dev = JSON.parse(initData);
      if (dev?.dev === true && isText(dev.user?.name)) {
        return {
          tgId: Number.isInteger(dev.user.tgId) ? dev.user.tgId : stableDevId(dev.user.name),
          name: dev.user.name.slice(0, 40),
          username: isText(dev.user.username) ? dev.user.username.slice(0, 40) : '',
          avatarUrl: isSafePhotoUrl(dev.user.avatarUrl) ? dev.user.avatarUrl : '',
        };
      }
    } catch {
      /* fall through to the real check */
    }
    return null;
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const checkString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = hmacSha256(utf8('WebAppData'), utf8(config.botToken));
  const expected = hmacSha256(secret, utf8(checkString));
  if (!timingSafeEqual(hexToBytes(hash), expected)) return null;

  try {
    const user = JSON.parse(params.get('user') ?? '');
    const name = [user.first_name, user.last_name].filter(isText).join(' ').trim().slice(0, 40);
    if (!name) return null;
    return {
      tgId: Number(user.id),
      name,
      username: isText(user.username) ? user.username.slice(0, 40) : '',
      avatarUrl: isSafePhotoUrl(user.photo_url) ? user.photo_url : '',
    };
  } catch {
    return null;
  }
}

// photo_url from the Telegram profile — https only, no credentials.
function isSafePhotoUrl(v) {
  if (typeof v !== 'string' || v.length > 1024) return false;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

// ---------- crypto helpers (hex-encoded like Telegram) ----------

import { CryptoHasher } from 'bun';

const utf8 = (s) => new TextEncoder().encode(s);

// HMAC-SHA256 via Bun's synchronous hasher — key and data as bytes,
// digest as bytes.
function hmacSha256(key, data) {
  const block = 64;
  const k =
    key.length > block ? new Uint8Array(new CryptoHasher('sha256').update(key).digest()) : key;
  const ipad = new Uint8Array(block).fill(0x36);
  const opad = new Uint8Array(block).fill(0x5c);
  for (let i = 0; i < k.length; i++) {
    ipad[i] ^= k[i];
    opad[i] ^= k[i];
  }
  const inner = new CryptoHasher('sha256');
  inner.update(ipad);
  inner.update(data);
  const outer = new CryptoHasher('sha256');
  outer.update(opad);
  outer.update(inner.digest());
  return new Uint8Array(outer.digest());
}

function hexToBytes(hex) {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return new Uint8Array(0);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
