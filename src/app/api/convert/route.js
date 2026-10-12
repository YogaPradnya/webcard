import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ensureQuantityColumn, getUserCollection } from '@/lib/cards';
import { isDisplayOwned } from '@/lib/display';
import { CONVERT_XP_REWARD, calcLevel } from '@/lib/gacha';

// POST /api/convert { items: [{ charName, qty }] } — konversi copy kartu menjadi XP.
// Rate ikut tabel bot (Common 50 / Rare 150 / Epic 400 / Legendary 1000 / Mythic 2500 per copy).
export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ success: false, message: 'Pilih minimal 1 kartu.' }, { status: 400 });
  }
  if (items.length > 100) {
    return NextResponse.json({ success: false, message: 'Maksimal 100 jenis kartu per konversi.' }, { status: 400 });
  }
  try {
    await ensureQuantityColumn();
    const db = getDb();
    const owned = await getUserCollection(session.id);
    let totalXp = 0;
    const converted = [];
    for (const it of items) {
      const name = String(it?.charName || '').trim();
      const qty = Math.max(1, Math.floor(Number(it?.qty) || 0));
      if (!name) return NextResponse.json({ success: false, message: 'Nama kartu tidak valid.' }, { status: 400 });
      const has = owned[name.toLowerCase()];
      if (!has) {
        return NextResponse.json({ success: false, message: `Kamu tidak punya ${name}.` }, { status: 400 });
      }
      // Kartu pajangan (display-only) tidak bisa dikonversi.
      if (await isDisplayOwned(session.id, name)) {
        return NextResponse.json({ success: false, message: `${name} adalah kartu pajangan, tidak bisa dikonversi.` }, { status: 400 });
      }
      if (qty > has.quantity) {
        return NextResponse.json({ success: false, message: `${name}: hanya punya ${has.quantity} copy.` }, { status: 400 });
      }
      const rate = CONVERT_XP_REWARD[has.rarity] || 0;
      totalXp += rate * qty;
      converted.push({ charName: name, rarity: has.rarity, qty, xp: rate * qty });
    }
    if (totalXp <= 0) {
      return NextResponse.json({ success: false, message: 'Tidak ada XP yang didapat.' }, { status: 400 });
    }
    for (const c of converted) {
      const has = owned[c.charName.toLowerCase()];
      if (has.quantity === c.qty) {
        await db.execute({
          sql: 'DELETE FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
          args: [String(session.id), c.charName],
        });
      } else {
        await db.execute({
          sql: 'UPDATE user_cards SET quantity = quantity - ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
          args: [c.qty, String(session.id), c.charName],
        });
      }
    }
    const xpRes = await db.execute({ sql: 'SELECT xp, username FROM user_stats WHERE user_id = ?', args: [String(session.id)] });
    const curXp = xpRes.rows.length > 0 ? Number(xpRes.rows[0].xp) || 0 : 0;
    const curName = xpRes.rows.length > 0 && xpRes.rows[0].username ? String(xpRes.rows[0].username) : (session.username || '');
    const newXp = curXp + totalXp;
    await db.execute({
      sql: `INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level, username = excluded.username`,
      args: [String(session.id), curName, newXp, calcLevel(newXp)],
    });
    return NextResponse.json({ success: true, converted, totalXp, xpBefore: curXp, xpAfter: newXp, level: calcLevel(newXp) });
  } catch (e) {
    console.error('[CONVERT]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal konversi.' }, { status: 500 });
  }
}
