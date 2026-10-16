export function mapUserCardRow(r) {
  return {
    charName: String(r.char_name),
    anime: String(r.anime || ''),
    rarity: String(r.rarity || 'Common'),
    level: Number(r.level) || 1,
    power: Number(r.power) || 0,
    imageUrl: r.image_url || null,
    showcase: Number(r.is_showcase) === 1,
    quantity: Math.max(1, Number(r.quantity) || 1),
  };
}

export async function getUserCard(db, userId, charName) {
  const res = await db.execute({
    sql: 'SELECT char_name, anime, rarity, level, power, image_url, is_showcase, quantity FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
    args: [String(userId), String(charName)],
  });
  if (res.rows.length === 0) return null;
  return mapUserCardRow(res.rows[0]);
}

export async function getUserXp(db, userId) {
  try {
    const res = await db.execute({ sql: 'SELECT xp FROM user_stats WHERE user_id = ?', args: [String(userId)] });
    return res.rows.length > 0 ? Number(res.rows[0].xp) || 0 : 0;
  } catch {
    return 0;
  }
}

// Debit atomik 1 statement: kurangi HANYA bila saldo cukup. Return { ok, xpBefore }.
// Dua debit konkuren tidak bisa overdraw (tepat 1 pemenang). amount<=0 = gratis.
export async function debitXp(db, userId, amount) {
  const need = Math.max(0, Math.floor(Number(amount) || 0));
  const xpBefore = await getUserXp(db, userId);
  if (need <= 0) return { ok: true, xpBefore };
  try {
    const res = await db.execute({
      sql: 'UPDATE user_stats SET xp = xp - ? WHERE user_id = ? AND xp >= ?',
      args: [need, String(userId), need],
    });
    if ((Number(res.rowsAffected) || 0) > 0) return { ok: true, xpBefore };
    return { ok: false, xpBefore };
  } catch {
    return { ok: false, xpBefore };
  }
}

// Kredit relatif (refund/konsolasi). Best-effort, tidak pernah throw.
export async function creditXp(db, userId, amount) {
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  if (add <= 0) return;
  try {
    await db.execute({
      sql: 'UPDATE user_stats SET xp = xp + ? WHERE user_id = ?',
      args: [add, String(userId)],
    });
  } catch { /* abaikan */ }
}
