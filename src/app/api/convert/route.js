import { getDb } from '@/lib/db';
import { ensureQuantityColumn, getUserCollection, invalidateBookCache } from '@/lib/cards';
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

    // Gabungkan item duplikat SEBELUM validasi. Tanpa ini, dua entri dengan
    // nama sama masing-masing lolos cek `qty <= has.quantity`, lalu total
    // yang dikonversi bisa melebihi stok (dan XP tercipta dari kartu hantu).
    const requested = new Map();
    for (const it of items) {
      const name = String(it?.charName || '').trim();
      const qty = Math.floor(Number(it?.qty));
      if (!name || !Number.isFinite(qty) || qty < 1) {
        return jsonFail('Nama/jumlah kartu tidak valid.', 400);
      }
      const key = name.toLowerCase();
      const prev = requested.get(key);
      requested.set(key, { charName: prev?.charName || name, qty: (prev?.qty || 0) + qty });
    }
    if (requested.size === 0) return jsonFail('Pilih minimal 1 kartu.', 400);

    let totalXp = 0;
    const converted = [];
    for (const item of requested.values()) {
      const name = item.charName;
      const qty = item.qty;
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

    // Potong stok secara kondisional. Bila stok berubah di tengah jalan,
    // kembalikan potongan sebelumnya (best-effort) dan minta user retry.
    const applied = [];
    const rollbackCards = async () => {
      for (const c of applied) {
        await db.execute({
          sql: 'UPDATE user_cards SET quantity = quantity + ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
          args: [c.qty, String(session.id), c.charName],
        }).catch(() => {});
      }
    };
    for (const c of converted) {
      let res;
      try {
        res = await db.execute({
          sql: 'UPDATE user_cards SET quantity = quantity - ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?) AND quantity >= ?',
          args: [c.qty, String(session.id), c.charName, c.qty],
        });
      } catch (updateError) {
        await rollbackCards();
        invalidateBookCache(session.id);
        console.error('[CONVERT] Gagal memotong stok:', updateError.message);
        return jsonFail('Gagal memotong kartu. Tidak ada yang dikonversi.', 500);
      }
      const changed = Number(res.rowsAffected ?? res.changes ?? 0);
      if (changed === 0) {
        await rollbackCards();
        invalidateBookCache(session.id);
        return jsonFail('Stok kartu berubah. Muat ulang lalu coba lagi.', 409);
      }
      applied.push(c);
    }

    let xpRes;
    try {
      xpRes = await db.execute({
        sql: `INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                xp = MAX(0, user_stats.xp + ?),
                username = CASE WHEN user_stats.username IS NULL OR user_stats.username = ''
                  THEN excluded.username ELSE user_stats.username END
              RETURNING xp`,
        args: [String(session.id), String(session.username || ''), totalXp, calcLevel(totalXp), totalXp],
      });
    } catch (xpError) {
      await rollbackCards();
      invalidateBookCache(session.id);
      console.error('[CONVERT] Gagal menambah XP:', xpError.message);
      return jsonFail('Gagal menambah XP. Kartu tidak jadi dikonversi.', 500);
    }

    const newXp = Math.max(0, Number(xpRes?.rows?.[0]?.xp) || 0);
    const level = calcLevel(newXp);
    await db.execute({
      sql: 'UPDATE user_stats SET level = ? WHERE user_id = ?',
      args: [level, String(session.id)],
    }).catch(() => {});
    // Baru hapus baris kosong setelah XP sukses; kalau XP gagal, rollback
    // masih bisa menambah quantity karena row-nya belum dihapus.
    await db.execute({
      sql: 'DELETE FROM user_cards WHERE user_id = ? AND quantity <= 0',
      args: [String(session.id)],
    }).catch(() => {});
    invalidateBookCache(session.id);
    return jsonOk({
      converted,
      totalXp,
      xpBefore: Math.max(0, newXp - totalXp),
      xpAfter: newXp,
      level,
    });
  } catch (e) {
    console.error('[CONVERT]', e.message);
    return jsonFail('Gagal konversi.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/convert/route.js' });
