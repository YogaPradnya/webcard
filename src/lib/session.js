import { createHash, randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'node:crypto';

const COOKIE_NAME = 'cards_session';

// Kunci 32 byte turunan SESSION_SECRET (scrypt, salt statis agar valid lintas instance serverless).
// Di-cache per proses: scrypt sinkron ~40-100ms dan sebelumnya dihitung ULANG di
// setiap request (unseal cookie tiap API) sehingga memblokir event loop.
// Kunci konstan selama SESSION_SECRET tidak berubah (deploy ulang = hitung ulang).
let _key = null;
function sessionKey() {
  if (_key) return _key;
  const secret = process.env.SESSION_SECRET || '';
  if (!secret || secret.length < 16) {
    throw new Error('SESSION_SECRET belum diisi (min 16 karakter) di .env.local');
  }
  _key = scryptSync(secret, 'animein-card-book', 32);
  return _key;
}

// Segel { id, key, username } -> string cookie (AES-256-GCM).
export function sealSession(payload) {
  const key = sessionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const text = JSON.stringify({
    id: String(payload.id),
    key: String(payload.key),
    username: String(payload.username || ''),
    // Kedaluwarsa di dalam ciphertext: cookie tidak bisa dipakai selamanya
    // hanya karena browser mengabaikan Max-Age.
    exp: Number(payload.exp) || (Date.now() + sessionMaxAgeSeconds() * 1000),
  });
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

// Buka segel cookie -> { id, key, username } atau null bila rusak/kadaluarsa format.
export function unsealSession(sealed) {
  try {
    const key = sessionKey();
    const buf = Buffer.from(String(sealed || ''), 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const text = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    const obj = JSON.parse(text);
    if (!obj || obj.id == null) return null;
    if (!Number.isFinite(Number(obj.exp)) || Number(obj.exp) <= Date.now()) return null;
    return { id: String(obj.id), key: String(obj.key || ''), username: String(obj.username || '') };
  } catch {
    return null;
  }
}

export function sessionCookieHeader(sealed, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${sealed}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookieHeader() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function sessionMaxAgeSeconds() {
  const days = Number(process.env.SESSION_MAX_AGE_DAYS || 7);
  const safe = Number.isFinite(days) ? Math.min(30, Math.max(1, days)) : 7;
  return safe * 24 * 60 * 60;
}

export { COOKIE_NAME };

// Ambil sesi dari header Cookie request. Return { id, key, username } atau null.
export function getSessionFromRequest(req) {
  const header = req.headers.get('cookie') || '';
  const jar = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k && !(k in jar)) {
      try {
        jar[k] = decodeURIComponent(v);
      } catch {
        jar[k] = v;
      }
    }
  }
  if (!jar[COOKIE_NAME]) return null;
  return unsealSession(jar[COOKIE_NAME]);
}

// Hash tampilan untuk log tanpa membocorkan key_client.
export function maskKey(key) {
  return createHash('sha256').update(String(key || '')).digest('hex').slice(0, 8);
}
