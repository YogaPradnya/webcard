import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ensureLoginCodeTable, generateLoginCode, hashToken, newToken, LOGIN_CODE_TTL_MS } from '@/lib/loginCode';

function tokenCookie(token, maxAge) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `login_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

// POST /api/auth/code — buat kode login 6 huruf untuk sesi browser ini.
export async function POST() {
  try {
    await ensureLoginCodeTable();
    const db = getDb();
    await db.execute('DELETE FROM web_login_codes WHERE expires_at <= ?', [Date.now()]);

    let code = '';
    for (let i = 0; i < 10; i++) {
      const cand = generateLoginCode();
      const exists = await db.execute({ sql: 'SELECT code FROM web_login_codes WHERE code = ?', args: [cand] });
      if (exists.rows.length === 0) {
        code = cand;
        break;
      }
    }
    if (!code) {
      return NextResponse.json({ success: false, message: 'Gagal buat kode.' }, { status: 500 });
    }

    const token = newToken();
    const expiresAt = Date.now() + LOGIN_CODE_TTL_MS;
    await db.execute({
      sql: 'INSERT INTO web_login_codes (code, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)',
      args: [code, hashToken(token), expiresAt, Date.now()],
    });
    const res = NextResponse.json({ success: true, code, expiresAt });
    res.headers.set('Set-Cookie', tokenCookie(token, Math.ceil(LOGIN_CODE_TTL_MS / 1000)));
    return res;
  } catch (e) {
    console.error('[LOGIN CODE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal buat kode.' }, { status: 500 });
  }
}
