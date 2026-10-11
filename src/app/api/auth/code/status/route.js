import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ensureLoginCodeTable, hashToken } from '@/lib/loginCode';
import { sealSession, sessionCookieHeader, sessionMaxAgeSeconds } from '@/lib/session';

function getToken(req) {
  const header = req.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === 'login_token') return decodeURIComponent(rest.join('='));
  }
  return '';
}

// GET /api/auth/code/status — polling: pending / claimed (buat sesi) / expired.
export async function GET(req) {
  const token = getToken(req);
  if (!token) return NextResponse.json({ success: true, status: 'expired' });

  try {
    await ensureLoginCodeTable();
    const db = getDb();
    await db.execute('DELETE FROM web_login_codes WHERE expires_at <= ?', [Date.now()]);
    const res = await db.execute({
      sql: 'SELECT code, user_id, username FROM web_login_codes WHERE token_hash = ?',
      args: [hashToken(token)],
    });
    if (res.rows.length === 0) return NextResponse.json({ success: true, status: 'expired' });
    const row = res.rows[0];
    if (!row.user_id) return NextResponse.json({ success: true, status: 'pending' });

    const userId = String(row.user_id);
    const username = String(row.username || '');
    await db.execute({ sql: 'DELETE FROM web_login_codes WHERE token_hash = ?', args: [hashToken(token)] });
    const sealed = sealSession({ id: userId, key: '', username });
    const response = NextResponse.json({ success: true, status: 'claimed', username });
    response.headers.append('Set-Cookie', 'login_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
    response.headers.append('Set-Cookie', sessionCookieHeader(sealed, sessionMaxAgeSeconds()));
    return response;
  } catch (e) {
    console.error('[LOGIN STATUS]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal cek status.' }, { status: 500 });
  }
}
