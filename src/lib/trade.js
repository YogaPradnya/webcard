import { getDb } from './db.js';
import { isSchemaReady } from './schema.js';
import { ensureQuantityColumn } from './cards.js';

export const MAX_CARD_COPIES = 999;

export const TRADE_CODE_LENGTH = 6;
export const TRADE_TTL_MS = 10 * 60 * 1000;
export const MAX_ACTIVE_TRADES_PER_USER = 10;

// Urutan tier untuk aturan trade.
export const TRADE_TIER_ORDER = { Common: 0, Rare: 1, Epic: 2, Legendary: 3, Mythic: 4 };

// Nilai tukar per tier (2x per tingkat). Total kedua sisi harus SAMA,
// kecuali semua kartu satu tier (bebas, seperti aturan lama).
export const TRADE_POINT = { Common: 1, Rare: 2, Epic: 4, Legendary: 8, Mythic: 16 };

// Maksimal kartu per sisi dalam 1 penawaran (total copy).
export const MAX_TRADE_CARDS_PER_SIDE = 10;

/**
 * Aturan nilai trade bundle (multi-kartu, maks 10 per sisi):
 * - Tiap sisi wajib 1..10 kartu (total copy), tiap item qty >= 1.
 * - Tidak boleh ada kartu yang sama di kedua sisi.
 * - Semua kartu satu tier (kedua sisi): bebas.
 * - Selain itu: total nilai kedua sisi harus sama.
 *   Contoh: 2 Rare (2x2=4) untuk 1 Epic (4) -> adil.
 * Return { ok:true, giveValue, takeValue, giveCount, takeCount }
 * atau { ok:false, message, ... }.
 */
export function checkBundleRule(giveItems, takeItems) {
  const g = bundleStats(giveItems);
  const t = bundleStats(takeItems);
  const base = { giveValue: g.value, takeValue: t.value, giveCount: g.count, takeCount: t.count };
  if (!Array.isArray(giveItems) || giveItems.length === 0 || !Array.isArray(takeItems) || takeItems.length === 0) {
    return { ok: false, message: 'Masing-masing sisi wajib ada kartu.', ...base };
  }
  if (g.count < 1 || t.count < 1) {
    return { ok: false, message: 'Masing-masing sisi wajib ada kartu.', ...base };
  }
  if (g.count > MAX_TRADE_CARDS_PER_SIDE || t.count > MAX_TRADE_CARDS_PER_SIDE) {
    return { ok: false, message: `Maksimal ${MAX_TRADE_CARDS_PER_SIDE} kartu per sisi.`, ...base };
  }
  const takeNames = new Set(takeItems.map((i) => String(i.charName || i.name || '').toLowerCase()));
  if (giveItems.some((i) => takeNames.has(String(i.charName || i.name || '').toLowerCase()))) {
    return { ok: false, message: 'Ada kartu yang sama di kedua sisi, tidak perlu tukar.', ...base };
  }
  const allTiers = new Set([...g.tiers, ...t.tiers]);
  if (allTiers.size === 1) return { ok: true, ...base };
  if (g.value === t.value) return { ok: true, ...base };
  return {
    ok: false,
    message: `Nilai tidak seimbang (${g.value} vs ${t.value}). Samakan total: C1 R2 E4 L8 M16 per kartu.`,
    ...base,
  };
}

export function bundleStats(items) {
  let count = 0;
  let value = 0;
  const tiers = new Set();
  for (const it of items || []) {
    const qty = Math.max(0, Math.floor(Number(it.amount ?? it.qty) || 0));
    if (qty < 1) continue;
    const rar = String(it.rarity || it.tier || 'Common');
    count += qty;
    value += (TRADE_POINT[rar] ?? 0) * qty;
    tiers.add(rar);
  }
  return { count, value, tiers: [...tiers] };
}

// Normalisasi bundle dari input: gabung duplikat (nama sama), buang qty < 1 / nama kosong.
export function normalizeBundleItems(raw) {
  const map = new Map();
  for (const it of raw || []) {
    const name = String(it.charName || it.name || '').trim();
    if (!name) continue;
    const qty = Math.floor(Number(it.amount ?? it.qty) || 0);
    if (qty < 1) continue;
    const key = name.toLowerCase();
    const prev = map.get(key);
    if (prev) {
      prev.amount += qty;
      if (it.rarity || it.tier) prev.rarity = String(it.rarity || it.tier);
    } else {
      map.set(key, { charName: name, rarity: String(it.rarity || it.tier || 'Common'), amount: qty });
    }
  }
  return [...map.values()];
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

// Tukar bundle multi-kartu antar user (maks 10 kartu per sisi).
// - offer.items (sisi penawar) pindah ke penerima; takerItems (sisi penerima) pindah ke penawar.
// - Tiap kartu menumpuk bila sudah punya; baris quantity 0 dihapus.
// - Return { ok, received[], given[] } atau { ok:false, message }.
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
  // Ambil data live (rarity ikut kartu saat ini) + cek kepemilikan.
  const giveCards = [];
  for (const it of giveReq) {
    const c = await getCardOwner(db, offer.ownerId, it.charName);
    if (!c) return { ok: false, message: `Kartu penawar ${it.charName} sudah tidak ada.` };
    if (c.quantity < it.amount) {
      return { ok: false, message: `Penawar hanya punya ${c.quantity} copy ${c.charName}.` };
    }
    giveCards.push({ ...c, amount: it.amount });
  }
  const takeCards = [];
  for (const it of takeReq) {
    const c = await getCardOwner(db, accepterId, it.charName);
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
    const has = await getCardOwner(db, accepterId, g.charName);
    if (has && has.quantity + g.amount > MAX_CARD_COPIES) {
      return { ok: false, message: `${g.charName} milikmu akan melebihi ${MAX_CARD_COPIES} copy.` };
    }
  }
  for (const t of takeCards) {
    const has = await getCardOwner(db, offer.ownerId, t.charName);
    if (has && has.quantity + t.amount > MAX_CARD_COPIES) {
      return { ok: false, message: `${t.charName} milik penawar akan melebihi ${MAX_CARD_COPIES} copy.` };
    }
  }

  // Kurangi pengirim (hapus baris bila habis).
  for (const g of giveCards) {
    if (g.quantity === g.amount) {
      await db.execute({
        sql: 'DELETE FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
        args: [String(offer.ownerId), g.charName],
      });
    } else {
      await db.execute({
        sql: 'UPDATE user_cards SET quantity = quantity - ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
        args: [g.amount, String(offer.ownerId), g.charName],
      });
    }
  }
  for (const t of takeCards) {
    if (t.quantity === t.amount) {
      await db.execute({
        sql: 'DELETE FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
        args: [String(accepterId), t.charName],
      });
    } else {
      await db.execute({
        sql: 'UPDATE user_cards SET quantity = quantity - ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
        args: [t.amount, String(accepterId), t.charName],
      });
    }
  }

  // Tambahkan ke penerima (menumpuk) — gagal di satu sisi = gagal semua (lempar error).
  try {
    for (const g of giveCards) await grantCopies(db, accepterId, accepterUsername, g, g.amount);
    for (const t of takeCards) await grantCopies(db, offer.ownerId, offer.ownerUsername, t, t.amount);
  } catch (e) {
    console.error('[TRADE GRANT]', e.message);
    return { ok: false, message: 'Gagal memindahkan kartu. Coba lagi.' };
  }

  await db.execute({ sql: 'DELETE FROM trade_offer_items WHERE code = ?', args: [offer.code] });
  await db.execute({ sql: 'DELETE FROM trade_offers WHERE code = ?', args: [offer.code] });
  // Misi: catat trade selesai untuk kedua pihak.
  try {
    const { recordEvent } = await import('./missions.js');
    await recordEvent(offer.ownerId, offer.ownerUsername, 'trade', 1);
    await recordEvent(accepterId, accepterUsername, 'trade', 1);
  } catch { /* misi non-kritis */ }
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
