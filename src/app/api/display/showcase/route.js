import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ensureDisplayTable } from '@/lib/display';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// POST /api/display/showcase { name, showcase: boolean } — pajang kartu display dari web (slot terpisah).
async function POST_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const name = String(body.name || '').trim();
  const showcase = body.showcase !== undefined ? Boolean(body.showcase) : true;
  if (!name) return NextResponse.json({ success: false, message: 'Nama kartu wajib diisi.' }, { status: 400 });
  try {
    await ensureDisplayTable();
    const db = getDb();
    const check = await db.execute({
      sql: 'SELECT id FROM user_display_cards WHERE user_id = ? AND LOWER(name) = LOWER(?)',
      args: [String(session.id), name],
    });
    if (check.rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Kamu tidak punya kartu pajangan itu.' }, { status: 400 });
    }
    if (showcase) {
      await db.execute({
        sql: 'UPDATE user_display_cards SET is_showcase = 0 WHERE user_id = ?',
        args: [String(session.id)],
      });
    }
    await db.execute({
      sql: 'UPDATE user_display_cards SET is_showcase = ? WHERE user_id = ? AND LOWER(name) = LOWER(?)',
      args: [showcase ? 1 : 0, String(session.id), name],
    });
    return NextResponse.json({ success: true, name, showcase });
  } catch (e) {
    console.error('[DISPLAY SHOWCASE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal atur pajangan.' }, { status: 500 });
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = withTimeout(POST_impl, WRITE_TIMEOUT_MS, 'src/app/api/display/showcase/route.js');
