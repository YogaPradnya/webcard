import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { getEffectiveArt } from '@/lib/cards';

// POST /api/cards/showcase { charName, showcase: boolean } — atur kartu pajangan dari web.
export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const charName = String(body.charName || '').trim();
  const showcase = Boolean(body.showcase);
  if (!charName) return NextResponse.json({ success: false, message: 'Nama kartu wajib diisi.' }, { status: 400 });
  try {
    const db = getDb();
    const check = await db.execute({
      sql: 'SELECT char_name, image_url FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [String(session.id), charName],
    });
    if (check.rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Kamu tidak punya kartu itu.' }, { status: 400 });
    }
    if (showcase) {
      // Satu pajangan aktif: matikan yang lain dulu (maks 1 showcase seperti bot).
      await db.execute({
        sql: 'UPDATE user_cards SET is_showcase = 0 WHERE user_id = ?',
        args: [String(session.id)],
      });
      // Backfill image_url bila kosong: bot (.profil) hanya menampilkan pajangan
      // yang punya image_url di DB, sementara web selama ini pakai art fallback lokal.
      if (!check.rows[0].image_url) {
        try {
          const art = await getEffectiveArt(String(check.rows[0].char_name || charName));
          if (art) {
            await db.execute({
              sql: 'UPDATE user_cards SET image_url = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
              args: [art, String(session.id), charName],
            });
          }
        } catch { /* non-kritis: pajangan tetap tersimpan */ }
      }
    }
    await db.execute({
      sql: 'UPDATE user_cards SET is_showcase = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [showcase ? 1 : 0, String(session.id), charName],
    });
    return NextResponse.json({ success: true, charName, showcase });
  } catch (e) {
    console.error('[SHOWCASE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal atur pajangan.' }, { status: 500 });
  }
}
