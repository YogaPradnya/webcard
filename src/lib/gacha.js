import { getDb, readSetting } from './db.js';
import { isSchemaReady } from './schema.js';
import { WAIFU_POOL } from '../data/waifuPool.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const staticArt = require('../data/cardArt.json');
const cloudArt = require('../data/cardArtCloud.json');
import { ensureQuantityColumn } from './cards.js';
import { calcLevel } from './level.js';
import { jakartaDateKey } from './jakartaTime.js';
import { sanitizePoolInput } from './pool.js';
import { clampInt, clampFloat } from './num.js';
import { hashNameLower } from './hash.js';
import { getUserCard, getUserXp, debitXp, creditXp } from './userCardsRepo.js';
import { invalidateBookCache } from './cards.js';
import { MAX_CARD_COPIES, GACHA_HISTORY_LIMIT } from './constants.js';
import { parseExcludedUsernames, excludedUsernamesClause } from './exclusions.js';

export { calcLevel, jakartaDateKey };

// Engine gacha web — port setia logika bot (src/database/cardsRepo.js) dengan aturan web:
// - Mythic UNIK per user (tidak bisa duplikat, downgrade seperti bot).
// - Stok pemilik per kartu: Epic 50, Legendary 10. Mythic TANPA batas pemilik
//   (satu kartu Mythic bisa dimiliki banyak orang, bonus/gacha tidak mengunci).
// - Epic/Legendary/Rare/Common MENUMPUK via quantity (maks 999, evo full manual).
// - TANPA limit harian (limit hanya berlaku di bot). total_pulls tetap dicatat.
// - 10x = 9x cost (diskon 10%).
// - Art: override dashboard > cloud > statis (tanpa live-fetch seperti bot).

export const RARITY_LIST = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];
export const DEFAULT_RATES = { Common: 70, Rare: 25, Epic: 4.89, Legendary: 0.1, Mythic: 0.01 };
export const GACHA_COST = 500;
export const MAX_CARD_LEVEL = 5;
// Maksimal tumpukan copy per kartu per user (evo full manual, sama seperti bot).
// (dipindah ke constants.js, re-export agar import lama tetap jalan)
export { MAX_CARD_COPIES };
export const TEN_DISCOUNT_NUM = 9; // 10x bayar 9x harga satuan (diskon 10%)

// Nilai konversi kartu -> XP (sama seperti bonus Limit Break bot).
export const CONVERT_XP_REWARD = { Common: 50, Rare: 150, Epic: 400, Legendary: 1000, Mythic: 2500 };

const BASE_POWER = { Common: 40, Rare: 70, Epic: 100, Legendary: 150, Mythic: 200 };
// Stok global per kartu = jumlah pemilik. Mythic sengaja TIDAK dibatasi:
// kartu Mythic bisa dimiliki banyak orang (tidak terkunci oleh bonus/gacha).
// Legendary/Epic tetap terbatas dan turun tier bila habis.
const STOCK_LIMITS = { Common: Infinity, Rare: Infinity, Epic: 50, Legendary: 10 };
const DEFAULT_STOCKS = { Legendary: 10, Epic: 50 };
// Username yang diabaikan dari hitungan stok global (akun tes/admin).
// Env STOCK_EXCLUDE_USERNAMES="yogaa,admin" (koma). Default: yogaa.
// Parser & klausa SQL kini di lib/exclusions.js (dipakai juga filter
// klasemen Kolektor); nama lama di-re-export agar import lama tetap jalan.
export { parseExcludedUsernames as parseStockExclusions };

function stockExclusionClause(excl) {
  return excludedUsernamesClause(excl, 'username', 'AND').sql;
}
const RARITY_DOWNGRADE = { Mythic: 'Legendary', Legendary: 'Epic', Epic: 'Rare', Rare: 'Common', Common: null };
// Web: hanya Mythic yang unik per user (Epic/Legendary boleh menumpuk).
function isUniqueRarityWeb(rarity) {
  return rarity === 'Mythic';
}

function groupPoolByTier(list) {
  const pools = { Common: [], Rare: [], Epic: [], Legendary: [], Mythic: [] };
  for (const entry of list || []) {
    if (entry && pools[entry.tier]) pools[entry.tier].push(entry);
  }
  return pools;
}

// Config + pool + art efektif (dashboard override atau default), mirror bot.
export async function getGachaSettings() {
  const config = { cost: GACHA_COST, rates: { ...DEFAULT_RATES }, stocks: { ...DEFAULT_STOCKS } };
  let pool = WAIFU_POOL;
  let art = {};
  try {
    const [costRaw, ratesRaw, stocksRaw, poolRaw, artRaw] = await Promise.all([
      readSetting('gacha_cost'),
      readSetting('gacha_rates'),
      readSetting('gacha_stocks'),
      readSetting('gacha_pool'),
      readSetting('gacha_art'),
    ]);
    if (costRaw != null) config.cost = clampInt(costRaw, 0, 100000, config.cost);
    if (ratesRaw != null) {
      try {
        const parsed = JSON.parse(ratesRaw) || {};
        const clean = {};
        let total = 0;
        for (const r of RARITY_LIST) {
          clean[r] = clampFloat(parsed[r], 0, 100, DEFAULT_RATES[r]);
          total += clean[r];
        }
        if (total > 0) config.rates = clean;
      } catch { /* default */ }
    }
    if (stocksRaw != null) {
      try {
        const parsed = JSON.parse(stocksRaw) || {};
        const clean = {};
        for (const r of Object.keys(DEFAULT_STOCKS)) {
          clean[r] = clampInt(parsed[r], 1, 1000, DEFAULT_STOCKS[r]);
        }
        config.stocks = clean;
      } catch { /* default */ }
    }
    if (poolRaw != null) {
      try {
        const checked = sanitizePoolInput(JSON.parse(poolRaw));
        if (checked) pool = checked;
      } catch { /* default */ }
    }
    if (artRaw != null) {
      try {
        const parsed = JSON.parse(artRaw) || {};
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v) art[String(k).toLowerCase()] = v;
        }
      } catch { /* abaikan */ }
    }
  } catch { /* default */ }
  return { config, pool, art };
}

export function resolveArt(poolArt, name) {
  const key = String(name || '').toLowerCase();
  return poolArt[key] || cloudArt[key] || staticArt[key] || null;
}

function normalizeRates(rates) {
  const weights = RARITY_LIST.map((r) => {
    const n = Number(rates?.[r]);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const base = total > 0 ? weights : RARITY_LIST.map((r) => DEFAULT_RATES[r]);
  const sum = base.reduce((a, b) => a + b, 0);
  let acc = 0;
  return RARITY_LIST.map((r, i) => {
    acc += (base[i] / sum) * 100;
    return [acc, r];
  });
}

function rollRarity(rng, rates) {
  const v = rng() * 100;
  for (const [max, rarity] of normalizeRates(rates)) {
    if (v < max) return rarity;
  }
  return 'Mythic';
}

function hashCardName(name) {
  return hashNameLower(name);
}

export function calcPower(rarity, level, charName = '') {
  const base = BASE_POWER[rarity] || 40;
  const variance = String(charName || '').trim() ? hashCardName(charName) % 10 : Math.floor(Math.random() * 10);
  return base + Number(level || 1) * 10 + variance;
}

async function countCardOwners(db, charName) {
  try {
    const excl = parseStockExclusions();
    const res = await db.execute({
      sql: `SELECT COUNT(*) AS c FROM user_cards WHERE char_name = ?${stockExclusionClause(excl)}`,
      args: [charName, ...excl],
    });
    return Number(res.rows[0]?.c || 0);
  } catch {
    return 0;
  }
}

async function getCard(db, userId, charName) {
  return getUserCard(db, userId, charName);
}

// Pilih kartu tersedia: lewati milik sendiri bila unik (L/M) + stok global habis.
// Downgrade otomatis ke tier bawah. Return { picked, rarity, stockLeft } atau null.
// opts.excludeNames dipakai hadiah top-up agar 2 kartu dalam 1 order tidak
// memilih karakter yang sama.
async function pickAvailableCard(db, userId, startRarity, pools, rng, stockLimits, opts = {}) {
  const excludeNames = opts.excludeNames || null;
  let r = startRarity;
  while (r) {
    const pool = pools[r] || [];
    const tries = Math.max(10, pool.length * 2);
    for (let i = 0; i < tries; i++) {
      if (pool.length === 0) break;
      const cand = pool[Math.floor(rng() * pool.length)];
      if (!cand) continue;
      if (excludeNames?.has(String(cand.name || '').toLowerCase())) continue;
      if (isUniqueRarityWeb(r)) {
        let owned = null;
        try {
          owned = await getCard(db, userId, cand.name);
        } catch { owned = null; }
        if (owned) continue;
      }
      const limit = stockLimits[r];
      let stockLeft = null;
      if (Number.isFinite(limit)) {
        const owners = await countCardOwners(db, cand.name);
        if (owners >= limit) continue;
        stockLeft = limit - owners - 1;
      }
      return { picked: cand, rarity: r, stockLeft };
    }
    r = RARITY_DOWNGRADE[r];
  }
  return null;
}

// Hadiah kartu langsung dari Top-Up (bukan hasil roll gacha).
// Memilih kartu tersedia pada tier yang diminta; bila stok tier habis,
// turun ke tier bawahnya seperti gacha. Semua kartu ditulis dalam SATU
// statement agar tetap aman tanpa transaksi/batch tulis di request path.
export async function grantCardBonus(userId, username, bonusCards) {
  const requested = Object.entries(bonusCards || {})
    .map(([rarity, qty]) => [rarity, Math.max(0, Math.floor(Number(qty) || 0))])
    .filter(([rarity, qty]) => qty > 0 && RARITY_LIST.includes(rarity));
  if (requested.length === 0) return { granted: [], requested: [] };

  await ensureQuantityColumn();
  const db = getDb();
  const { config, pool, art } = await getGachaSettings();
  const pools = groupPoolByTier(pool);
  const stockLimits = { ...STOCK_LIMITS, ...(config.stocks || {}) };
  const rng = Math.random;

  for (let attempt = 0; attempt < 3; attempt++) {
    const exclude = new Set();
    const selected = [];
    for (const [rarity, count] of requested) {
      for (let i = 0; i < count; i++) {
        let selection = null;
        let existing = null;
        for (let tries = 0; tries < 20; tries++) {
          selection = await pickAvailableCard(
            db, userId, rarity, pools, rng, stockLimits, { excludeNames: exclude },
          );
          if (!selection) break;
          existing = await getCard(db, userId, selection.picked.name);
          // Kalau copy sudah penuh, cari kartu lain (jangan hanguskan bonus).
          if (existing && Math.max(1, Number(existing.quantity) || 1) >= MAX_CARD_COPIES) {
            exclude.add(String(selection.picked.name).toLowerCase());
            selection = null;
            continue;
          }
          break;
        }
        if (!selection) break;
        const picked = selection.picked;
        exclude.add(String(picked.name).toLowerCase());
        const level = existing?.level || 1;
        selected.push({
          charName: picked.name,
          anime: picked.anime,
          rarity: selection.rarity,
          level,
          power: existing?.power || calcPower(selection.rarity, level, picked.name),
          imageUrl: existing?.imageUrl || resolveArt(art, picked.name),
          isNew: !existing,
          quantity: existing
            ? Math.min(MAX_CARD_COPIES, Math.max(1, Number(existing.quantity) || 1) + 1)
            : 1,
          requestedRarity: rarity,
          downgraded: selection.rarity !== rarity,
        });
      }
    }
    if (selected.length === 0) return { granted: [], requested };

    const placeholders = selected
      .map(() => '(?, ?, ?, ?, ?, 1, ?, ?, 1, CURRENT_TIMESTAMP)')
      .join(', ');
    const args = [];
    for (const c of selected) {
      args.push(
        String(userId), String(username || ''), c.charName,
        String(c.anime || ''), c.rarity, c.power, c.imageUrl,
      );
    }
    try {
      await db.execute({
        sql: `INSERT INTO user_cards (user_id, username, char_name, anime, rarity, level, power, image_url, quantity, pulled_at)
              VALUES ${placeholders}
              ON CONFLICT(user_id, char_name) DO UPDATE SET
                quantity = MIN(${MAX_CARD_COPIES}, COALESCE(user_cards.quantity, 1) + 1),
                username = excluded.username`,
        args,
      });
      invalidateBookCache(userId);
      return { granted: selected, requested };
    } catch (e) {
      const msg = String(e?.message || e).toLowerCase();
      // Balapan stok/unik: statement tunggal sudah rollback, pilih ulang.
      if (attempt < 2 && msg.includes('unique')) continue;
      throw e;
    }
  }
  return { granted: [], requested };
}

async function getPityState(db, userId) {
  try {
    if (!isSchemaReady()) {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_card_pity (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL DEFAULT '',
        pity_count INTEGER DEFAULT 0,
        total_pulls INTEGER DEFAULT 0,
        pulls_today INTEGER DEFAULT 0,
        today_key TEXT DEFAULT '',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    }
    const res = await db.execute({
      sql: 'SELECT pity_count, total_pulls, pulls_today, today_key FROM user_card_pity WHERE user_id = ?',
      args: [String(userId)],
    });
    if (res.rows.length === 0) return { pity_count: 0, total_pulls: 0, pulls_today: 0, today_key: '' };
    const r = res.rows[0];
    return {
      pity_count: Number(r.pity_count) || 0,
      total_pulls: Number(r.total_pulls) || 0,
      pulls_today: Number(r.pulls_today) || 0,
      today_key: String(r.today_key || ''),
    };
  } catch {
    return { pity_count: 0, total_pulls: 0, pulls_today: 0, today_key: '' };
  }
}

export async function ensureGachaHistory() {
  if (isSchemaReady()) return; // DDL sudah diurus migrasi (0 round-trip).
  await getDb().execute(`
    CREATE TABLE IF NOT EXISTS web_gacha_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      char_name TEXT NOT NULL,
      rarity TEXT NOT NULL DEFAULT 'Common',
      is_new INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);
  await getDb().execute('CREATE INDEX IF NOT EXISTS idx_gacha_hist_user ON web_gacha_history (user_id, id DESC)');
}

export function tenCost(cost) {
  // 10x pull bayar 9x harga satuan (diskon 10%): 500 -> 4500.
  return Math.max(0, Math.floor(Number(cost) || 0) * TEN_DISCOUNT_NUM);
}

// Gacha web count=1|10. Tanpa daily cap. Return { pulls, costTotal, ... } atau { error }.
export async function performWebPulls(userId, username, count, todayKey) {
  const db = getDb();
  await ensureQuantityColumn();
  await ensureGachaHistory();
  const n = count === 10 ? 10 : 1;
  const { config, pool, art } = await getGachaSettings();
  const pools = groupPoolByTier(pool);
  const stockLimits = { ...STOCK_LIMITS, ...(config.stocks || {}) };
  const costTotal = n === 10 ? tenCost(config.cost) : config.cost;

  // Debit atomik di depan (anti double-spend): 1 statement, gagal = NO_XP.
  const { ok: debitOk, xpBefore: curXp } = await debitXp(db, userId, costTotal);
  if (!debitOk) {
    return { error: 'NO_XP', xp: curXp, costTotal, cost: config.cost };
  }

  let state = await getPityState(db, userId);
  if (state.today_key !== todayKey) state = { ...state, pulls_today: 0, today_key: todayKey };

  const pulls = [];
  const rng = Math.random;
  let consolationTotal = 0;
  for (let i = 0; i < n; i++) {
    const rolledRarity = rollRarity(rng, config.rates);
    const selection = await pickAvailableCard(db, userId, rolledRarity, pools, rng, stockLimits);
    if (!selection) {
      if (pulls.length === 0) return { error: 'SOLD_OUT', costTotal, cost: config.cost };
      break;
    }
    const picked = selection.picked;
    const rarity = selection.rarity;
    const downgraded = selection.rarity !== rolledRarity;
    const existing = await getCard(db, userId, picked.name);
    let level;
    let power;
    let imageUrl;
    let isNew;
    let quantity = 1;
    let capped = false;
    let xpBonus = 0;
    if (!existing) {
      isNew = true;
      level = 1;
      power = calcPower(rarity, 1, picked.name);
      imageUrl = resolveArt(art, picked.name);
      try {
        await db.execute({
          sql: `INSERT INTO user_cards (user_id, username, char_name, anime, rarity, level, power, image_url, quantity, pulled_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1, CURRENT_TIMESTAMP)`,
          args: [String(userId), String(username || ''), picked.name, picked.anime, rarity, power, imageUrl],
        });
      } catch (e) {
        // Balapan stok unik (L/M diambil user lain bersamaan): fallback downgrade sekali.
        if (isUniqueRarityWeb(rarity) && String(e.message || '').toLowerCase().includes('unique')) {
          const fb = await pickAvailableCard(db, userId, RARITY_DOWNGRADE[rarity] || 'Common', pools, rng, stockLimits);
          if (!fb) {
            if (pulls.length === 0) return { error: 'SOLD_OUT', costTotal, cost: config.cost };
            break;
          }
          const fbExisting = await getCard(db, userId, fb.picked.name);
          if (fbExisting) {
            const fbQty = Math.max(1, Number(fbExisting.quantity) || 1);
            if (fbQty >= MAX_CARD_COPIES) {
              const bonus = CONVERT_XP_REWARD[fb.rarity] || 0;
              consolationTotal += bonus;
              pulls.push({ charName: fb.picked.name, anime: fb.picked.anime, rarity: fb.rarity, level: fbExisting.level, power: fbExisting.power, imageUrl: fbExisting.imageUrl, isNew: false, stacked: false, capped: true, quantity: fbQty, xpBonus: bonus, downgraded: true, stockLeft: fb.stockLeft });
            } else {
              await db.execute({
                sql: 'UPDATE user_cards SET quantity = quantity + 1, username = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
                args: [String(username || ''), String(userId), fb.picked.name],
              });
              pulls.push({ charName: fb.picked.name, anime: fb.picked.anime, rarity: fb.rarity, level: fbExisting.level, power: fbExisting.power, imageUrl: fbExisting.imageUrl, isNew: false, stacked: true, capped: false, quantity: fbQty + 1, xpBonus: 0, downgraded: true, stockLeft: fb.stockLeft });
            }
          } else {
            const fbPower = calcPower(fb.rarity, 1, fb.picked.name);
            const fbArt = resolveArt(art, fb.picked.name);
            await db.execute({
              sql: `INSERT INTO user_cards (user_id, username, char_name, anime, rarity, level, power, image_url, quantity, pulled_at)
                    VALUES (?, ?, ?, ?, ?, 1, ?, ?, 1, CURRENT_TIMESTAMP)`,
              args: [String(userId), String(username || ''), fb.picked.name, fb.picked.anime, fb.rarity, fbPower, fbArt],
            });
            pulls.push({ charName: fb.picked.name, anime: fb.picked.anime, rarity: fb.rarity, level: 1, power: fbPower, imageUrl: fbArt, isNew: true, stacked: false, downgraded: true, stockLeft: fb.stockLeft });
          }
          continue;
        }
        throw e;
      }
    } else {
      // Menumpuk (hanya Mythic yang unik; tier lain menumpuk s/d 999).
      isNew = false;
      level = existing.level;
      power = existing.power;
      imageUrl = existing.imageUrl || resolveArt(art, picked.name);
      const haveQty = Math.max(1, Number(existing.quantity) || 1);
      if (haveQty >= MAX_CARD_COPIES) {
        // Cap penuh: copy hangus jadi XP hiburan.
        capped = true;
        quantity = haveQty;
        consolationTotal += CONVERT_XP_REWARD[rarity] || 0;
        xpBonus = CONVERT_XP_REWARD[rarity] || 0;
      } else {
        quantity = haveQty + 1;
        if (!existing.imageUrl && imageUrl) {
          await db.execute({
            sql: 'UPDATE user_cards SET quantity = quantity + 1, username = ?, image_url = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
            args: [String(username || ''), imageUrl, String(userId), picked.name],
          });
        } else {
          await db.execute({
            sql: 'UPDATE user_cards SET quantity = quantity + 1, username = ? WHERE user_id = ? AND LOWER(char_name) = LOWER(?)',
            args: [String(username || ''), String(userId), picked.name],
          });
        }
      }
    }
    pulls.push({
      charName: picked.name, anime: picked.anime, rarity, level, power, imageUrl,
      isNew, stacked: !isNew && !capped, capped, quantity, xpBonus, downgraded, stockLeft: selection.stockLeft,
    });
  }

  // Bayar proporsional bila pull berhenti dini (SOLD_OUT): cost per pull dibulatkan.
  // XP hiburan (cap penuh) ditambahkan setelah bayar.
  // Debit SUDAH terjadi atomik di depan; di sini hanya refund selisih + bonus
  // via kredit relatif (tidak pernah menimpa XP milik penulis lain).
  const paidCount = pulls.length;
  const paidTotal = n === 10 && paidCount === 10 ? costTotal : Math.ceil((costTotal / n) * paidCount);
  const refund = Math.max(0, costTotal - paidTotal) + consolationTotal;
  await creditXp(db, userId, refund);
  const newXp = await getUserXp(db, userId);
  await db.execute({
    sql: `INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET level = excluded.level, username = excluded.username`,
    args: [String(userId), String(username || ''), newXp, calcLevel(newXp)],
  });
  const next = {
    pity_count: state.pity_count,
    total_pulls: state.total_pulls + paidCount,
    pulls_today: state.pulls_today + paidCount,
    today_key: todayKey,
  };
  await db.execute({
    sql: `INSERT INTO user_card_pity (user_id, username, pity_count, total_pulls, pulls_today, today_key, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET pity_count = excluded.pity_count, total_pulls = excluded.total_pulls,
          pulls_today = excluded.pulls_today, today_key = excluded.today_key, updated_at = CURRENT_TIMESTAMP`,
    args: [String(userId), String(username || ''), next.pity_count, next.total_pulls, next.pulls_today, next.today_key],
  });
  const now = Date.now();
  for (const p of pulls) {
    try {
      await db.execute({
        sql: 'INSERT INTO web_gacha_history (user_id, char_name, rarity, is_new, created_at) VALUES (?, ?, ?, ?, ?)',
        args: [String(userId), p.charName, p.rarity, p.isNew ? 1 : 0, now],
      });
    } catch { /* non-kritis */ }
  }
  // Retensi: simpan maksimal GACHA_HISTORY_LIMIT riwayat per user.
  try {
    await db.execute({
      sql: `DELETE FROM web_gacha_history WHERE user_id = ? AND id NOT IN
            (SELECT id FROM web_gacha_history WHERE user_id = ? ORDER BY id DESC LIMIT ${GACHA_HISTORY_LIMIT})`,
      args: [String(userId), String(userId)],
    });
  } catch { /* non-kritis */ }
  // Misi: catat jumlah pull ke progres harian/mingguan.
  try {
    const { recordEvent } = await import('./missions.js');
    if (paidCount > 0) await recordEvent(userId, username, 'gacha', paidCount);
  } catch { /* misi non-kritis */ }
  if (paidCount > 0) invalidateBookCache(userId);
  return { pulls, costTotal: paidTotal, xpBefore: curXp, xpAfter: newXp, ...next };
}

// Hitung unit stok dari map {namaLower: pemilik} (murni, gampang dites).
// left = total unit tersisa serum tier, total = total unit serum tier.
export function computeStockUnits(pool, stocks, owners = {}) {
  const out = { Mythic: null, Legendary: null, Epic: null };
  const norm = {};
  for (const [k, v] of Object.entries(owners)) norm[String(k).toLowerCase()] = Number(v) || 0;
  for (const tier of ['Mythic', 'Legendary', 'Epic']) {
    const limit = stocks?.[tier] ?? STOCK_LIMITS[tier];
    if (!Number.isFinite(limit)) { out[tier] = null; continue; }
    let left = 0;
    let total = 0;
    for (const p of pool || []) {
      if (p.tier !== tier) continue;
      total += limit;
      left += Math.max(0, limit - (norm[String(p.name).toLowerCase()] || 0));
    }
    out[tier] = { left, total };
  }
  return out;
}

// Ringkasan stok global tier terbatas (dalam unit, bukan jumlah kartu).
export async function stockSummary(pool, stocks) {
  const db = getDb();
  const out = { Mythic: null, Legendary: null, Epic: null };
  try {
    const excl = parseStockExclusions();
    const res = await db.execute({
      sql: `SELECT LOWER(char_name) AS n, COUNT(*) AS c FROM user_cards WHERE rarity IN ('Mythic','Legendary','Epic')${stockExclusionClause(excl)} GROUP BY LOWER(char_name)`,
      args: [...excl],
    });
    const owners = {};
    for (const r of res.rows) owners[String(r.n)] = Number(r.c) || 0;
    return computeStockUnits(pool, stocks, owners);
  } catch { /* null = tak diketahui */ }
  return out;
}
