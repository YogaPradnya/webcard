import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { getBookCards } from '@/lib/cards';
import { computeTitles, ensureWebTitleColumn } from '@/lib/titles';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// POST /api/profile/title { title } — pasang gelar WEB yang sudah didapat (atau "" untuk lepas).
// Disimpan di user_stats.web_title agar custom_title (gelar costume bot) tidak tersentuh.
async function POST_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const title = String(body.title || '').trim().slice(0, 40);
  try {
    const db = getDb();
    await ensureWebTitleColumn();
    if (!title) {
      await db.execute({ sql: 'UPDATE user_stats SET web_title = NULL WHERE user_id = ?', args: [String(session.id)] });
      return NextResponse.json({ success: true, title: null });
    }
    const book = await getBookCards(session.id);
    const ownedMap = {};
    for (const c of book.cards) if (c.owned) ownedMap[String(c.name).toLowerCase()] = true;
    const computed = computeTitles(book.cards.map((c) => ({ name: c.name, tier: c.tier })), ownedMap);
    const found = computed.earned.find((t) => t.title === title);
    if (!found) {
      return NextResponse.json({ success: false, message: 'Gelar belum didapat.' }, { status: 400 });
    }
    await db.execute({ sql: 'UPDATE user_stats SET web_title = ? WHERE user_id = ?', args: [title, String(session.id)] });
    return NextResponse.json({ success: true, title });
  } catch (e) {
    console.error('[PROFILE TITLE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal pasang gelar.' }, { status: 500 });
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = withTimeout(POST_impl, WRITE_TIMEOUT_MS, 'src/app/api/profile/title/route.js');
