import { getDb } from '@/lib/db';
import { ensureQuantityColumn, getUserCollection } from '@/lib/cards';
import { isDisplayOwned } from '@/lib/display';
import { CONVERT_XP_REWARD, calcLevel } from '@/lib/gacha';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/convert { items: [{ charName, qty }] } — konversi copy kartu menjadi XP.
// Rate ikut tabel bot (Common 50 / Rare 150 / Epic 400 / Legendary 1000 / Mythic 2500 per copy).
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return jsonFail('Pilih minimal 1 kartu.', 400);
  }
  if (items.length > 100) {
    return jsonFail('Maksimal 100 jenis kartu per konversi.', 400);
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
      if (!name) return jsonFail('Nama kartu tidak valid.', 400);
      const has = owned[name.toLowerCase()];
      if (!has) {
        return jsonFail(`Kamu tidak punya ${name}.`, 400);
      }
      // Kartu pajangan (display-only) tidak bisa dikonversi.
      if (await isDisplayOwned(session.id, name)) {
        return jsonFail(`${name} adalah kartu pajangan, tidak bisa dikonversi.`, 400);
      }
      if (qty > has.quantity) {
        return jsonFail(`${name}: hanya punya ${has.quantity} copy.`, 400);
      }
      const rate = CONVERT_XP_REWARD[has.rarity] || 0;
      totalXp += rate * qty;
      converted.push({ charName: name, rarity: has.rarity, qty, xp: rate * qty });
    }
    if (totalXp <= 0) {
      return jsonFail('Tidak ada XP yang didapat.', 400);
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
    return jsonOk({ converted, totalXp, xpBefore: curXp, xpAfter: newXp, level: calcLevel(newXp) });
  } catch (e) {
    console.error('[CONVERT]', e.message);
    return jsonFail('Gagal konversi.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/convert/route.js' });
