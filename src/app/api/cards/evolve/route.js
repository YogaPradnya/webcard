import { getDb } from '@/lib/db';
import { ensureQuantityColumn, invalidateBookCache } from '@/lib/cards';
import { isDisplayOwned } from '@/lib/display';
import { MAX_CARD_LEVEL, checkEvoCost, isEvoBlockedRarity } from '@/lib/evolve';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/cards/evolve { charName } — Evolusi manual: syarat copy per level
// (★1->2: 3, ★2->3: 3, ★3->4: 3, ★4->5: 5; konsumsi N-1) -> level+1 (maks 5), power+10.
// Legendary/Mythic & kartu pajangan tidak bisa evolusi.
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const charName = String(body.charName || '').trim();
  if (!charName) return jsonFail('Nama kartu wajib diisi.', 400);
  try {
    await ensureQuantityColumn();
    // Kartu pajangan (display-only) tidak bisa evolusi.
    if (await isDisplayOwned(session.id, charName)) {
      return jsonFail('Kartu pajangan tidak bisa evolusi.', 400);
    }
    const db = getDb();
    const res = await db.execute({
      sql: 'SELECT char_name, rarity, level, power, quantity FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [String(session.id), charName],
    });
    if (res.rows.length === 0) {
      return jsonFail('Kamu tidak punya kartu itu.', 400);
    }
    const row = res.rows[0];
    const rarity = String(row.rarity || 'Common');
    if (isEvoBlockedRarity(rarity)) {
      return jsonFail('Legend/Mythic tidak bisa evolusi.', 400);
    }
    const level = Number(row.level) || 1;
    const qty = Math.max(1, Number(row.quantity) || 1);
    if (level >= MAX_CARD_LEVEL) {
      return jsonFail('Sudah ★5 maksimal.', 400);
    }
    const checked = checkEvoCost(level, qty);
    if (!checked.ok) {
      if (checked.error === 'NEED_MORE') {
        return jsonFail(`Butuh ${checked.need} copy ★${level} (punya ${checked.have}).`, 400);
      }
      return jsonFail('Level tidak valid.', 400);
    }
    const cost = { need: checked.need, consume: checked.consume };
    const newLevel = level + 1;
    const newPower = (Number(row.power) || 0) + 10;
    const newQty = qty - cost.consume;
    await db.execute({
      sql: 'UPDATE user_cards SET level = ?, power = ?, quantity = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [newLevel, newPower, newQty, String(session.id), charName],
    });
    invalidateBookCache(session.id);
    return jsonOk({
      charName: String(row.char_name),
      level: newLevel,
      power: newPower,
      quantity: newQty,
      unlockedSkill2: newLevel >= MAX_CARD_LEVEL,
    });
  } catch (e) {
    console.error('[EVOLVE]', e.message);
    return jsonFail('Gagal evolusi.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/cards/evolve/route.js' });
