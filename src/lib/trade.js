import { getDb } from './db';
import { ensureQuantityColumn } from './cards.js';

export const MAX_CARD_COPIES = 999;

export const TRADE_CODE_LENGTH = 6;
export const TRADE_TTL_MS = 10 * 60 * 1000;
export const MAX_ACTIVE_TRADES_PER_USER = 10;

// Urutan tier untuk aturan trade.
export const TRADE_TIER_ORDER = { Common: 0, Rare: 1, Epic: 2, Legendary: 3, Mythic: 4 };

/**
 * Aturan nilai trade (berlaku untuk semua tier):
 * - Tier sama: bebas (seperti sebelumnya).
 * - Selisih 1 tier: wajib 1 lawan 1.
 * - Selisih 2 tier: wajib 3 (tier bawah) lawan 1 (tier atas).
 * - Selisih 3+ tier: dilarang.
 * Return { ok:true } atau { ok:false, message }.
 */
export function checkTradeTierRule(aRarity, aAmount, bRarity, bAmount) {
  const a = TRADE_TIER_ORDER[String(aRarity)] ?? 0;
  const b = TRADE_TIER_ORDER[String(bRarity)] ?? 0;
  const gap = Math.abs(a - b);
  if (gap === 0) return { ok: true };
  if (gap === 1) {
    if (aAmount === 1 && bAmount === 1) return { ok: true };
    return { ok: false, message: `Selisih 1 tier (${aRarity} ↔ ${bRarity}) hanya bisa 1 lawan 1.` };
  }
  if (gap === 2) {
    const hi = a > b ? String(aRarity) : String(bRarity);
    const lo = a > b ? String(bRarity) : String(aRarity);
    const hiAmt = a > b ? aAmount : bAmount;
    const loAmt = a > b ? bAmount : aAmount;
    if (hiAmt === 1 && loAmt === 3) return { ok: true };
    return { ok: false, message: `Butuh 3 ${lo} untuk 1 ${hi}.` };
  }
  return { ok: false, message: `Tidak bisa trade ${aRarity} dengan ${bRarity} (maksimal selisih 2 tier).` };
}

// Kode trade hanya angka (keypad numerik di HP).
export function generateTradeCode() {
  let code = '';
  for (let i = 0; i < TRADE_CODE_LENGTH; i++) {
    code += String(Math.floor(Math.random() * 10));
  }
  return code;
}

export function normalizeTradeCode(value) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 12);
}

export async function ensureTradeTable() {
  await ensureQuantityColumn();
  await getDb().execute(`
    CREATE TABLE IF NOT EXISTS trade_offers (
      code TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      owner_username TEXT NOT NULL DEFAULT '',
      char_name TEXT NOT NULL,
      rarity TEXT NOT NULL DEFAULT 'Common',
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await getDb().execute(
    'CREATE INDEX IF NOT EXISTS idx_trade_owner ON trade_offers (owner_id)',
  );
  await getDb().execute(
    'CREATE INDEX IF NOT EXISTS idx_trade_expires ON trade_offers (expires_at)',
  );
  await getDb().execute(
    'CREATE INDEX IF NOT EXISTS idx_trade_search ON trade_offers (owner_username, char_name, code)',
  );
  // Jumlah copy per penawaran (stacking). Best-effort untuk DB lama.
  try { await getDb().execute('ALTER TABLE trade_offers ADD COLUMN amount INTEGER DEFAULT 1'); } catch { /* sudah ada */ }
  try { await getDb().execute('UPDATE trade_offers SET amount = 1 WHERE amount IS NULL OR amount < 1'); } catch { /* abaikan */ }
}

export async function getOffer(db, code) {
  const res = await db.execute({
    sql: 'SELECT code, owner_id, owner_username, char_name, rarity, expires_at, amount FROM trade_offers WHERE code = ?',
    args: [code],
  });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    code: String(r.code),
    ownerId: String(r.owner_id),
    ownerUsername: String(r.owner_username || ''),
    charName: String(r.char_name),
    rarity: String(r.rarity || 'Common'),
    expiresAt: Number(r.expires_at) || 0,
    amount: Math.max(1, Number(r.amount) || 1),
  };
}

export async function getCardOwner(db, userId, charName) {
  const res = await db.execute({
    sql: 'SELECT char_name, anime, rarity, level, power, image_url, is_showcase, quantity FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
    args: [String(userId), String(charName)],
  });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
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

// Catatan: konversi kartu -> XP pindah ke fitur Konversi (rate di lib/gacha.js).

// Tukar copy kartu antar user (semantik stack, tanpa auto-XP / Limit Break).
// - offer.amount copy kartu penawar pindah ke penerima (menumpuk bila sudah punya).
// - accepterAmount copy kartu penerima pindah ke penawar (menumpuk bila sudah punya).
// - Baris quantity 0 dihapus. Kartu pajangan yang habis ikut terhapus (flag ikut baris).
// - Kartu yang sama persis tetap ditolak.
// Return { ok, received, given } atau { ok:false, message }.
export async function executeTrade(db, offer, accepterId, accepterUsername, accepterCharName, accepterAmount = 1) {
  const giveAmount = Math.max(1, Math.floor(Number(offer.amount) || 1));
  const takeAmount = Math.max(1, Math.floor(Number(accepterAmount) || 1));
  const giverCard = await getCardOwner(db, offer.ownerId, offer.charName);
  const takerCard = await getCardOwner(db, accepterId, accepterCharName);
  if (!giverCard) return { ok: false, message: 'Kartu penawar sudah tidak ada.' };
  if (!takerCard) return { ok: false, message: 'Kamu tidak punya kartu itu.' };
  if (String(offer.ownerId) === String(accepterId)) {
    return { ok: false, message: 'Tidak bisa tukar dengan diri sendiri.' };
  }
  if (giverCard.charName.toLowerCase() === takerCard.charName.toLowerCase()) {
    return { ok: false, message: 'Kartunya sama, tidak perlu tukar.' };
  }
  const tierRule = checkTradeTierRule(giverCard.rarity, giveAmount, takerCard.rarity, takeAmount);
  if (!tierRule.ok) return { ok: false, message: tierRule.message };
  if (giverCard.quantity < giveAmount) {
    return { ok: false, message: `Penawar hanya punya ${giverCard.quantity} copy.` };
  }
  if (takerCard.quantity < takeAmount) {
    return { ok: false, message: `Kamu hanya punya ${takerCard.quantity} copy ${takerCard.charName}.` };
  }
  // Cap tumpukan 999: penerima tidak boleh melewatinya.
  const giverTarget = await getCardOwner(db, accepterId, giverCard.charName);
  const takerTarget = await getCardOwner(db, offer.ownerId, takerCard.charName);
  if (giverTarget && giverTarget.quantity + giveAmount > MAX_CARD_COPIES) {
    return { ok: false, message: `${giverCard.charName} milikmu akan melebihi ${MAX_CARD_COPIES} copy.` };
  }
  if (takerTarget && takerTarget.quantity + takeAmount > MAX_CARD_COPIES) {
    return { ok: false, message: `${takerCard.charName} milik penawar akan melebihi ${MAX_CARD_COPIES} copy.` };
  }

  // Kurangi pengirim (hapus baris bila habis).
  if (giverCard.quantity === giveAmount) {
    await db.execute({
      sql: 'DELETE FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [String(offer.ownerId), giverCard.charName],
    });
  } else {
    await db.execute({
      sql: 'UPDATE user_cards SET quantity = quantity - ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [giveAmount, String(offer.ownerId), giverCard.charName],
    });
  }
  if (takerCard.quantity === takeAmount) {
    await db.execute({
      sql: 'DELETE FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [String(accepterId), takerCard.charName],
    });
  } else {
    await db.execute({
      sql: 'UPDATE user_cards SET quantity = quantity - ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [takeAmount, String(accepterId), takerCard.charName],
    });
  }

  // Tambahkan ke penerima (menumpuk) — gagal di satu sisi = gagal semua (lempar error).
  try {
    await grantCopies(db, accepterId, accepterUsername, giverCard, giveAmount);
    await grantCopies(db, offer.ownerId, offer.ownerUsername, takerCard, takeAmount);
  } catch (e) {
    console.error('[TRADE GRANT]', e.message);
    return { ok: false, message: 'Gagal memindahkan kartu. Coba lagi.' };
  }

  await db.execute({ sql: 'DELETE FROM trade_offers WHERE code = ?', args: [offer.code] });
  return {
    ok: true,
    received: { ...giverCard, amount: giveAmount },
    given: { ...takerCard, amount: takeAmount },
  };
}

// Tambah N copy ke user: menumpuk bila sudah punya, baris baru (lv1) bila belum.
async function grantCopies(db, userId, username, card, amount) {
  const { calcPower } = await import('./gacha.js');
  const has = await getCardOwner(db, userId, card.charName);
  if (has) {
    if (has.quantity + amount > MAX_CARD_COPIES) {
      throw new Error(`Cap ${MAX_CARD_COPIES} copy terlampaui untuk ${card.charName}.`);
    }
    await db.execute({
      sql: 'UPDATE user_cards SET quantity = quantity + ?, username = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [amount, String(username || ''), String(userId), card.charName],
    });
    return;
  }
  await db.execute({
    sql: `INSERT INTO user_cards (user_id, username, char_name, anime, rarity, level, power, image_url, is_showcase, quantity, pulled_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?, 0, ?, CURRENT_TIMESTAMP)`,
    args: [
      String(userId), String(username || ''), card.charName, card.anime || '', card.rarity || 'Common',
      calcPower(card.rarity || 'Common', 1, card.charName), card.imageUrl || null, amount,
    ],
  });
}
