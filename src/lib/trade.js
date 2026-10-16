import { getDb } from './db.js';
import { isSchemaReady } from './schema.js';
import { ensureQuantityColumn, invalidateBookCache } from './cards.js';
import { MAX_CARD_COPIES } from './constants.js';
import { randomDigits } from './codes.js';
import { getUserCard as getCardOwner } from './userCardsRepo.js';
import {
  TRADE_TIER_ORDER,
  TRADE_POINT,
  MAX_TRADE_CARDS_PER_SIDE,
  bundleStats,
  normalizeBundleItems,
  checkBundleRule,
} from './tradeValue.js';

export { MAX_CARD_COPIES, getCardOwner, TRADE_TIER_ORDER, TRADE_POINT, MAX_TRADE_CARDS_PER_SIDE, bundleStats, normalizeBundleItems, checkBundleRule };

export const TRADE_CODE_LENGTH = 6;
export const TRADE_TTL_MS = 10 * 60 * 1000;
export const MAX_ACTIVE_TRADES_PER_USER = 10;

// Urutan tier untuk aturan trade.

// Kode trade hanya angka (keypad numerik di HP).
export function generateTradeCode() {
  return randomDigits(TRADE_CODE_LENGTH);
}

export function normalizeTradeCode(value) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 12);
}

export async function ensureTradeTable() {
  if (isSchemaReady()) return; // DDL sudah diurus migrasi (0 round-trip).
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
  // Item bundle multi-kartu per penawaran (sisi penawar). Best-effort untuk DB lama.
  await getDb().execute(`
    CREATE TABLE IF NOT EXISTS trade_offer_items (
      code TEXT NOT NULL,
      char_name TEXT NOT NULL,
      rarity TEXT NOT NULL DEFAULT 'Common',
      amount INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (code, char_name)
    )
  `);
  await getDb().execute(
    'CREATE INDEX IF NOT EXISTS idx_trade_items_code ON trade_offer_items (code)',
  );
}

export async function getOfferItems(db, code) {
  const res = await db.execute({
    sql: 'SELECT char_name, rarity, amount FROM trade_offer_items WHERE code = ?',
    args: [String(code)],
  });
  return res.rows.map((r) => ({
    charName: String(r.char_name),
    rarity: String(r.rarity || 'Common'),
    amount: Math.max(1, Number(r.amount) || 1),
  }));
}

// Bersihkan penawaran kedaluwarsa + item yatimnya. Pengganti DELETE inline di route.
export async function cleanupTradeOffers(db, now = Date.now()) {
  await db.execute({ sql: 'DELETE FROM trade_offer_items WHERE code NOT IN (SELECT code FROM trade_offers WHERE expires_at > ?)', args: [now] });
  await db.execute({ sql: 'DELETE FROM trade_offers WHERE expires_at <= ?', args: [now] });
}

export async function getOffer(db, code) {
  const res = await db.execute({
    sql: 'SELECT code, owner_id, owner_username, char_name, rarity, expires_at, amount FROM trade_offers WHERE code = ?',
    args: [code],
  });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  // Item bundle (sumber utama); fallback ke kolom legacy untuk penawaran lama.
  let items = [];
  try {
    items = await getOfferItems(db, code);
  } catch { items = []; }
  const legacy = {
    charName: String(r.char_name),
    rarity: String(r.rarity || 'Common'),
    amount: Math.max(1, Number(r.amount) || 1),
  };
  if (items.length === 0) items = [legacy];
  const totalCards = items.reduce((n, i) => n + (Number(i.amount) || 0), 0);
  return {
    code: String(r.code),
    ownerId: String(r.owner_id),
    ownerUsername: String(r.owner_username || ''),
    charName: legacy.charName,
    rarity: legacy.rarity,
    expiresAt: Number(r.expires_at) || 0,
    amount: Math.max(1, Number(r.amount) || 1),
    items,
    totalCards,
    totalValue: bundleStats(items).value,
  };
}

// Catatan: konversi kartu -> XP pindah ke fitur Konversi (rate di lib/gacha.js).

// Tukar bundle multi-kartu antar user (maks 10 kartu per sisi).
// - offer.items (sisi penawar) pindah ke penerima; takerItems (sisi penerima) pindah ke penawar.
// - Tiap kartu menumpuk bila sudah punya; baris quantity 0 dihapus.
// - Return { ok, received[], given[] } atau { ok:false, message }.
// - Bila db mendukung transaction(), baca+validasi+tulis jalan atomik
//   (all-or-nothing); bila tidak, fallback jalur lama. BUSY (penulis lain)
//   → pesan coba-lagi agar klien bisa retry (aman bareng idempotency-key).
export async function executeBundleTrade(db, offer, accepterId, accepterUsername, takerItemsRaw) {
  if (String(offer.ownerId) === String(accepterId)) {
    return { ok: false, message: 'Tidak bisa tukar dengan diri sendiri.' };
  }
  const giveReq = normalizeBundleItems(
    offer.items && offer.items.length
      ? offer.items
      : [{ charName: offer.charName, rarity: offer.rarity, amount: offer.amount }],
  );
  const takeReq = normalizeBundleItems(takerItemsRaw);
  let tx = null;
  if (typeof db.transaction === 'function') {
    try {
      tx = await db.transaction('write');
    } catch (e) {
      console.error('[TRADE TX]', e.message);
      return { ok: false, message: 'Server sibuk. Coba lagi.' };
    }
  }
  const conn = tx || db;
  let res;
  try {
    res = await runBundleTrade(conn, offer, accepterId, accepterUsername, giveReq, takeReq);
    if (tx) {
      if (res.ok) await tx.commit();
      else await tx.rollback();
    }
  } catch (e) {
    if (tx) {
      try { await tx.rollback(); } catch { /* abaikan */ }
    }
    console.error('[TRADE GRANT]', e.message);
    res = { ok: false, message: 'Gagal memindahkan kartu. Coba lagi.' };
  } finally {
    if (tx) tx.close();
  }
  if (!res.ok) return res;
  invalidateBookCache(offer.ownerId);
  invalidateBookCache(accepterId);
  // Misi: catat trade selesai untuk kedua pihak (di luar transaksi, non-kritis).
  try {
    const { recordEvent } = await import('./missions.js');
    await recordEvent(offer.ownerId, offer.ownerUsername, 'trade', 1);
    await recordEvent(accepterId, accepterUsername, 'trade', 1);
  } catch { /* misi non-kritis */ }
  return res;
}

// Inti tukar-bundle: validasi baca + tulis, jalan di atas conn (bisa transaksi).
// Return { ok, received[], given[] } / { ok:false, message }. Throw hanya untuk
// error DB tak terduga (pemanggil me-rollback).
async function runBundleTrade(conn, offer, accepterId, accepterUsername, giveReq, takeReq) {
  // Ambil data live (rarity ikut kartu saat ini) + cek kepemilikan.
  const giveCards = [];
  for (const it of giveReq) {
    const c = await getCardOwner(conn, offer.ownerId, it.charName);
    if (!c) return { ok: false, message: `Kartu penawar ${it.charName} sudah tidak ada.` };
    if (c.quantity < it.amount) {
      return { ok: false, message: `Penawar hanya punya ${c.quantity} copy ${c.charName}.` };
    }
    giveCards.push({ ...c, amount: it.amount });
  }
  const takeCards = [];
  for (const it of takeReq) {
    const c = await getCardOwner(conn, accepterId, it.charName);
    if (!c) return { ok: false, message: `Kamu tidak punya kartu ${it.charName}.` };
    if (c.quantity < it.amount) {
      return { ok: false, message: `Kamu hanya punya ${c.quantity} copy ${c.charName}.` };
    }
    takeCards.push({ ...c, amount: it.amount });
  }
  const rule = checkBundleRule(giveCards, takeCards);
  if (!rule.ok) return { ok: false, message: rule.message };
  // Cap tumpukan 999: penerima tidak boleh melewatinya.
  for (const g of giveCards) {
    const has = await getCardOwner(conn, accepterId, g.charName);
    if (has && has.quantity + g.amount > MAX_CARD_COPIES) {
      return { ok: false, message: `${g.charName} milikmu akan melebihi ${MAX_CARD_COPIES} copy.` };
    }
  }
  for (const t of takeCards) {
    const has = await getCardOwner(conn, offer.ownerId, t.charName);
    if (has && has.quantity + t.amount > MAX_CARD_COPIES) {
      return { ok: false, message: `${t.charName} milik penawar akan melebihi ${MAX_CARD_COPIES} copy.` };
    }
  }

  // Kurangi pengirim (hapus baris bila habis).
  for (const g of giveCards) {
    if (g.quantity === g.amount) {
      await conn.execute({
        sql: 'DELETE FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
        args: [String(offer.ownerId), g.charName],
      });
    } else {
      await conn.execute({
        sql: 'UPDATE user_cards SET quantity = quantity - ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
        args: [g.amount, String(offer.ownerId), g.charName],
      });
    }
  }
  for (const t of takeCards) {
    if (t.quantity === t.amount) {
      await conn.execute({
        sql: 'DELETE FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
        args: [String(accepterId), t.charName],
      });
    } else {
      await conn.execute({
        sql: 'UPDATE user_cards SET quantity = quantity - ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
        args: [t.amount, String(accepterId), t.charName],
      });
    }
  }

  // Tambahkan ke penerima (menumpuk). Throw → pemanggil rollback (all-or-nothing).
  for (const g of giveCards) await grantCopies(conn, accepterId, accepterUsername, g, g.amount);
  for (const t of takeCards) await grantCopies(conn, offer.ownerId, offer.ownerUsername, t, t.amount);

  await conn.execute({ sql: 'DELETE FROM trade_offer_items WHERE code = ?', args: [offer.code] });
  await conn.execute({ sql: 'DELETE FROM trade_offers WHERE code = ?', args: [offer.code] });
  const slim = (c) => ({ charName: c.charName, rarity: c.rarity, amount: c.amount });
  return { ok: true, received: giveCards.map(slim), given: takeCards.map(slim) };
}

// Kompatibilitas: tukar 1-lawan-1 seperti dulu. Bentuk hasil lama (objek)
// dipertahankan bila 1-vs-1, array bila bundle.
export async function executeTrade(db, offer, accepterId, accepterUsername, accepterCharName, accepterAmount = 1) {
  const res = await executeBundleTrade(db, offer, accepterId, accepterUsername, [
    { charName: accepterCharName, amount: accepterAmount },
  ]);
  if (!res.ok) return res;
  if (res.received.length === 1 && res.given.length === 1) {
    return { ok: true, received: res.received[0], given: res.given[0] };
  }
  return res;
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
