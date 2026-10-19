import { getDb } from '@/lib/db';
import { ensureLoginCodeTable, hashToken } from '@/lib/loginCode';
import { sealSession, sessionCookieHeader, sessionMaxAgeSeconds } from '@/lib/session';
import { apiHandler, jsonOk, jsonFail } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




function getTokens(req) {
  const out = [];
  const headerToken = String(req.headers.get('x-login-token') || '').trim();
  if (/^[a-f0-9]{64}$/i.test(headerToken)) out.push(headerToken);

  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === 'login_token') {
      let v = rest.join('=');
      try { v = decodeURIComponent(v); } catch { /* pakai nilai mentah */ }
      if (/^[a-f0-9]{64}$/i.test(v)) out.push(v);
      break;
    }
  }

  return [...new Set(out)];
}

// GET /api/auth/code/status — polling: pending / claimed (buat sesi) / expired.
async function GET_impl(req) {
  const tokens = getTokens(req);
  if (tokens.length === 0) return jsonOk({ status: 'expired' });

  try {
    await ensureLoginCodeTable();
    const db = getDb();
    await db.execute('DELETE FROM web_login_codes WHERE expires_at <= ?', [Date.now()]);

    // Coba token dari header browser dulu (tahan cookie hilang), lalu cookie.
    let token = '';
    let row = null;
    for (const candidate of tokens) {
      const res = await db.execute({
        sql: 'SELECT code, user_id, username, expires_at FROM web_login_codes WHERE token_hash = ?',
        args: [hashToken(candidate)],
      });
      if (res.rows.length > 0) {
        token = candidate;
        row = res.rows[0];
        break;
      }
    }
    if (!row) return jsonOk({ status: 'expired' });
    // Kode masih menunggu klaim: kembalikan juga code + expiresAt agar
    // halaman login bisa pulih sendiri setelah browser di-refresh.
    if (!row.user_id) {
      return jsonOk({
        status: 'pending',
        code: String(row.code || ''),
        expiresAt: Number(row.expires_at) || 0,
      });
    }

    const userId = String(row.user_id);
    const username = String(row.username || '');
    await db.execute({ sql: 'DELETE FROM web_login_codes WHERE token_hash = ?', args: [hashToken(token)] });
    const sealed = sealSession({ id: userId, key: '', username });
    const response = jsonOk({ status: 'claimed', username });
    response.headers.append('Set-Cookie', 'login_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    response.headers.append('Set-Cookie', sessionCookieHeader(sealed, sessionMaxAgeSeconds()));
    return response;
  } catch (e) {
    console.error('[LOGIN STATUS]', e.message);
    return jsonFail('Gagal cek status.', 500);
  }
}

// Tanpa auth (pakai cookie login_token sendiri); batas hang via apiHandler.
export const GET = apiHandler(GET_impl, { auth: false, tag: 'src/app/api/auth/code/status/route.js' });
