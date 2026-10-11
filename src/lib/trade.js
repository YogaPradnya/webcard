import { getDb } from './db';

export const TRADE_CODE_LENGTH = 6;
export const TRADE_TTL_MS = 30 * 60 * 1000;

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
}

export async function getOffer(db, code) {
  const res = await db.execute({
    sql: 'SELECT code, owner_id, owner_username, char_name, rarity, expires_at FROM trade_offers WHERE code = ?',
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
  };
}

export async function getCardOwner(db, userId, charName) {
  const res = await db.execute({
    sql: 'SELECT char_name, rarity, level, power, image_url, is_showcase FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
    args: [String(userId), String(charName)],
  });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    charName: String(r.char_name),
    rarity: String(r.rarity || 'Common'),
    level: Number(r.level) || 1,
    power: Number(r.power) || 0,
    imageUrl: r.image_url || null,
    showcase: Number(r.is_showcase) === 1,
  };
}

// Bonus XP duplikat (sama seperti Limit Break gacha di bot).
export const DUPE_XP_REWARD = { Common: 50, Rare: 150, Epic: 400, Legendary: 1000, Mythic: 2500 };
const MAX_CARD_LEVEL = 5;

function calcLevel(xp) {
  let lv = 1;
  while (xp >= Math.floor(20 * Math.pow(lv, 3))) lv++;
  return lv;
}

async function getUserXp(db, userId) {
  try {
    const r = await db.execute({ sql: 'SELECT xp FROM user_stats WHERE user_id = ?', args: [String(userId)] });
    if (r.rows.length > 0) return Number(r.rows[0].xp) || 0;
  } catch { /* user baru */ }
  return 0;
}

// Tukar 2 kartu antar user secara atomik.
// Bila penerima SUDAH punya kartu yang diterima -> jadi Limit Break:
// baris lama naik level (maks 5) + bonus XP, baris yang diberikan hangus.
// Kartu yang sama persis tetap ditolak (mencegah farm XP bolak-balik).
// Return { ok, received, given, dupeReceived, dupeGiven } atau { ok:false, message }.
export async function executeTrade(db, offer, accepterId, accepterUsername, accepterCharName) {
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
  const accepterHas = await getCardOwner(db, accepterId, giverCard.charName);
  const offererHas = await getCardOwner(db, offer.ownerId, takerCard.charName);

  const stmts = [];
  let dupeReceived = null;
  let dupeGiven = null;

  if (accepterHas) {
    const newLevel = Math.min(MAX_CARD_LEVEL, accepterHas.level + 1);
    const leveled = newLevel > accepterHas.level;
    const xpBonus = DUPE_XP_REWARD[giverCard.rarity] || 0;
    stmts.push({
      sql: 'UPDATE user_cards SET level = ?, power = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [newLevel, leveled ? accepterHas.power + 10 : accepterHas.power, String(accepterId), giverCard.charName],
    });
    stmts.push({
      sql: 'DELETE FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [String(offer.ownerId), giverCard.charName],
    });
    const curXp = await getUserXp(db, accepterId);
    stmts.push({
      sql: `INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level`,
      args: [String(accepterId), String(accepterUsername || ''), curXp + xpBonus, calcLevel(curXp + xpBonus)],
    });
    dupeReceived = { charName: giverCard.charName, level: newLevel, leveled, xpBonus };
  } else {
    stmts.push({
      sql: 'UPDATE user_cards SET user_id = ?, username = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [String(accepterId), String(accepterUsername || ''), String(offer.ownerId), giverCard.charName],
    });
  }

  if (offererHas) {
    const newLevel = Math.min(MAX_CARD_LEVEL, offererHas.level + 1);
    const leveled = newLevel > offererHas.level;
    const xpBonus = DUPE_XP_REWARD[takerCard.rarity] || 0;
    stmts.push({
      sql: 'UPDATE user_cards SET level = ?, power = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [newLevel, leveled ? offererHas.power + 10 : offererHas.power, String(offer.ownerId), takerCard.charName],
    });
    stmts.push({
      sql: 'DELETE FROM user_cards WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [String(accepterId), takerCard.charName],
    });
    const curXp = await getUserXp(db, offer.ownerId);
    stmts.push({
      sql: `INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level`,
      args: [String(offer.ownerId), String(offer.ownerUsername || ''), curXp + xpBonus, calcLevel(curXp + xpBonus)],
    });
    dupeGiven = { charName: takerCard.charName, level: newLevel, leveled, xpBonus };
  } else {
    stmts.push({
      sql: 'UPDATE user_cards SET user_id = ?, username = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
      args: [String(offer.ownerId), String(offer.ownerUsername || ''), String(accepterId), takerCard.charName],
    });
  }

  stmts.push({ sql: 'DELETE FROM trade_offers WHERE code = ?', args: [offer.code] });
  await db.batch(stmts);
  return { ok: true, received: giverCard, given: takerCard, dupeReceived, dupeGiven };
}
