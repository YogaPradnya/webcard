import { createHash, createHmac } from 'node:crypto';

const LOGIN_PATH = '/internal/auth/animein';
const REQUEST_TIMEOUT_MS = 15000;

function sha256Hex(value) {
  return createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function signRequest({ secret, timestamp, method, path, body }) {
  const canonical = `${timestamp}.${String(method || '').toUpperCase()}.${path}.${sha256Hex(body)}`;
  return createHmac('sha256', String(secret || '')).update(canonical, 'utf8').digest('hex');
}

// Panggil endpoint internal dashboard di Render. Web tidak pernah memanggil
// Animein langsung; password hanya lewat server-to-server dan tidak disimpan.
export async function verifyAnimeinCredentials(username, password) {
  const baseUrl = String(process.env.DASHBOARD_LOGIN_URL || '').trim().replace(/\/+$/, '');
  const secret = String(process.env.WEB_LOGIN_PROXY_SECRET || '');
  if (!baseUrl || !secret) return { ok: false, code: 'NOT_CONFIGURED' };

  const body = JSON.stringify({ username: String(username), password: String(password) });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signRequest({
    secret,
    timestamp,
    method: 'POST',
    path: LOGIN_PATH,
    body,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}${LOGIN_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Web-Timestamp': String(timestamp),
        'X-Web-Signature': signature,
      },
      body,
      cache: 'no-store',
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        code: data?.code || (res.status === 429 ? 'RATE_LIMITED' : 'UPSTREAM_UNAVAILABLE'),
      };
    }
    if (!data?.ok || !data?.user?.id) {
      return { ok: false, code: data?.code || 'UPSTREAM_UNAVAILABLE' };
    }

    const keyStatus = String(data.user.keyStatus || 'active').toLowerCase();
    if (keyStatus !== 'active') {
      return { ok: false, code: 'ACCOUNT_INACTIVE' };
    }

    return {
      ok: true,
      user: {
        id: String(data.user.id),
        keyStatus,
      },
    };
  } catch (e) {
    return {
      ok: false,
      code: e?.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
    };
  } finally {
    clearTimeout(timer);
  }
}
