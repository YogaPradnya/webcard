import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ensureQuantityColumn } from '@/lib/cards';
import { isDisplayOwned } from '@/lib/display';
import { MAX_CARD_LEVEL, checkEvoCost, isEvoBlockedRarity } from '@/lib/evolve';

// POST /api/cards/evolve { charName } — Evolusi manual: syarat copy per level
// (★1->2: 3, ★2->3: 3, ★3->4: 3, ★4->5: 5; konsumsi N-1) -> level+1 (maks 5), power+10.
// Legendary/Mythic & kartu pajangan tidak bisa evolusi.
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
  if (!charName) return NextResponse.json({ success: false, message: 'Nama kartu wajib diisi.' }, { status: 400 });
  try {
    await ensureQuantityColumn();
    // Kartu pajangan (display-only) tidak bisa evolusi.
    if (await isDisplayOwned(session.id, charName)) {
      return NextResponse.json({ success: false, message: 'Kartu pajangan tidak bisa evolusi.' }, { status: 400 });
    }
    const db = getDb();
    const res = await db.execute({
      sql: 'SELECT char_name, rarity, level, power, quantity FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [String(session.id), charName],
    });
    if (res.rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Kamu tidak punya kartu itu.' }, { status: 400 });
    }
    const row = res.rows[0];
    const rarity = String(row.rarity || 'Common');
    if (isEvoBlockedRarity(rarity)) {
      return NextResponse.json({ success: false, message: 'Legend/Mythic tidak bisa evolusi.' }, { status: 400 });
    }
    const level = Number(row.level) || 1;
    const qty = Math.max(1, Number(row.quantity) || 1);
    if (level >= MAX_CARD_LEVEL) {
      return NextResponse.json({ success: false, message: 'Sudah ★5 maksimal.' }, { status: 400 });
    }
    const checked = checkEvoCost(level, qty);
    if (!checked.ok) {
      if (checked.error === 'NEED_MORE') {
        return NextResponse.json(
          { success: false, message: `Butuh ${checked.need} copy ★${level} (punya ${checked.have}).` },
          { status: 400 },
        );
      }
      return NextResponse.json({ success: false, message: 'Level tidak valid.' }, { status: 400 });
    }
    const cost = { need: checked.need, consume: checked.consume };
    const newLevel = level + 1;
    const newPower = (Number(row.power) || 0) + 10;
    const newQty = qty - cost.consume;
    await db.execute({
      sql: 'UPDATE user_cards SET level = ?, power = ?, quantity = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [newLevel, newPower, newQty, String(session.id), charName],
    });
    return NextResponse.json({
      success: true,
      charName: String(row.char_name),
      level: newLevel,
      power: newPower,
      quantity: newQty,
      unlockedSkill2: newLevel >= MAX_CARD_LEVEL,
    });
  } catch (e) {
    console.error('[EVOLVE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal evolusi.' }, { status: 500 });
  }
}
