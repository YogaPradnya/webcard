import { createHash } from 'node:crypto';
import { getDb } from '@/lib/db';
import { verifyAnimeinCredentials } from '@/lib/dashboardAuth';
import { sealSession, sessionCookieHeader, sessionMaxAgeSeconds } from '@/lib/session';
import { checkRateCount } from '@/lib/rateLimit';
import { apiHandler, jsonOk, jsonFail, parseJson } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_PER_IP = 60;
const LOGIN_MAX_PER_USER = 5;

function getClientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const first = forwarded.split(',')[0].trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}

function hashUsername(username) {
  return createHash('sha256').update(String(username || '').trim().toLowerCase()).digest('hex').slice(0, 24);
}

function failForCode(code) {
  if (code === 'INVALID_CREDENTIALS') {
    return jsonFail('Username/email atau password Animein salah.', 401, code);
  }
  if (code === 'ACCOUNT_INACTIVE') {
    return jsonFail('Akun Animein tidak aktif.', 403, code);
  }
  if (code === 'RATE_LIMITED' || code === 'UPSTREAM_RATE_LIMITED') {
    return jsonFail('Terlalu banyak percobaan. Coba lagi nanti.', 429, 'RATE_LIMITED');
  }
  return jsonFail('Login sedang tidak tersedia. Coba lagi beberapa saat lagi.', 503, 'LOGIN_UNAVAILABLE');
}

// POST /api/auth/login
// Body: { username, password, tnc: true }
// Web memverifikasi kredensial lewat dashboard internal (Render), lalu
// mencocokkan user_id Animein ke user_stats Turso. Tidak ada auto-create.
async function POST_impl(req) {
  const { body, error } = await parseJson(req);
  if (error) return error;

  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');
  if (!body?.tnc) {
    return jsonFail('Centang persetujuan Syarat & Ketentuan dulu.', 400, 'TNC_REQUIRED');
  }
  if (!username || !password) {
    return jsonFail('Username/email dan password wajib diisi.', 400, 'INVALID_INPUT');
  }
  if (username.length > 200 || password.length > 256) {
    return jsonFail('Username/email atau password terlalu panjang.', 400, 'INVALID_INPUT');
  }

  const ip = getClientIp(req);
  const [ipLimit, userLimit] = await Promise.all([
    checkRateCount(`login:ip:${ip}`, LOGIN_MAX_PER_IP, LOGIN_RATE_WINDOW_MS),
    checkRateCount(`login:user:${hashUsername(username)}`, LOGIN_MAX_PER_USER, LOGIN_RATE_WINDOW_MS),
  ]);
  if (!ipLimit.ok || !userLimit.ok) {
    return jsonFail('Terlalu banyak percobaan. Coba lagi dalam 15 menit.', 429, 'RATE_LIMITED');
  }

  const auth = await verifyAnimeinCredentials(username, password);
  if (!auth.ok) {
    if (auth.code === 'UPSTREAM_BLOCKED' || auth.code === 'UPSTREAM_UNAVAILABLE' || auth.code === 'UPSTREAM_TIMEOUT') {
      console.warn('[LOGIN] dashboard/Animein upstream gagal:', auth.code);
    }
    return failForCode(auth.code);
  }

  let localUsername = '';
  try {
    const result = await getDb().execute({
      sql: 'SELECT username FROM user_stats WHERE user_id = ?',
      args: [auth.user.id],
    });
    if (result.rows.length === 0) {
      return jsonFail(
        'Akun Animein ini belum terdaftar di KartuYogaa. Silakan chat bot Animein terlebih dahulu.',
        403,
        'NOT_REGISTERED',
      );
    }
    localUsername = String(result.rows[0].username || '').trim();
  } catch (e) {
    console.error('[LOGIN] gagal lookup user_stats:', String(e?.message || e).slice(0, 160));
    return jsonFail('Terjadi kesalahan server. Coba lagi.', 500, 'SERVER_ERROR');
  }

  const displayName = localUsername || username;
  let sealed;
  try {
    sealed = sealSession({ id: auth.user.id, key: '', username: displayName });
  } catch (e) {
    console.error('[LOGIN] gagal membuat sesi:', String(e?.message || e).slice(0, 160));
    return jsonFail('Terjadi kesalahan server. Coba lagi.', 500, 'SERVER_ERROR');
  }

  const response = jsonOk({ username: displayName, redirect: '/book' });
  response.headers.set('Cache-Control', 'no-store');
  // Hapus sisa cookie login kode lama bila browser pernah memakainya.
  response.headers.append('Set-Cookie', 'login_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  response.headers.append('Set-Cookie', sessionCookieHeader(sealed, sessionMaxAgeSeconds()));
  return response;
}

export const POST = apiHandler(POST_impl, {
  auth: false,
  timeout: 20000,
  tag: 'src/app/api/auth/login/route.js',
});
