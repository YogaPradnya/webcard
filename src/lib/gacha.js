import { getDb, readSetting } from './db.js';
import { WAIFU_POOL, VALID_TIERS } from '../data/waifuPool.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const staticArt = require('../data/cardArt.json');
const cloudArt = require('../data/cardArtCloud.json');
import { ensureQuantityColumn } from './cards.js';

// Engine gacha web — port setia logika bot (src/database/cardsRepo.js) dengan aturan web:
// - Mythic UNIK per user (tidak bisa duplikat, downgrade seperti bot).
// - Epic/Legendary/Rare/Common MENUMPUK via quantity (maks 999, evo full manual).
// - TANPA limit harian (limit hanya berlaku di bot). total_pulls tetap dicatat.
// - 10x = 9x cost (diskon 10%).
// - Art: override dashboard > cloud > statis (tanpa live-fetch seperti bot).

export const RARITY_LIST = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'];
export const DEFAULT_RATES = { Common: 70, Rare: 25, Epic: 4.89, Legendary: 0.1, Mythic: 0.01 };
export const GACHA_COST = 500;
export const MAX_CARD_LEVEL = 5;
// Maksimal tumpukan copy per kartu per user (evo full manual, sama seperti bot).
export const MAX_CARD_COPIES = 999;
export const TEN_DISCOUNT_NUM = 9; // 10x bayar 9x harga satuan (diskon 10%)

// Nilai konversi kartu -> XP (sama seperti bonus Limit Break bot).
export const CONVERT_XP_REWARD = { Common: 50, Rare: 150, Epic: 400, Legendary: 1000, Mythic: 2500 };

const BASE_POWER = { Common: 40, Rare: 70, Epic: 100, Legendary: 150, Mythic: 200 };
const STOCK_LIMITS = { Common: Infinity, Rare: Infinity, Epic: 50, Legendary: 10, Mythic: 1 };
const DEFAULT_STOCKS = { Mythic: 1, Legendary: 10, Epic: 50 };
const RARITY_DOWNGRADE = { Mythic: 'Legendary', Legendary: 'Epic', Epic: 'Rare', Rare: 'Common', Common: null };
// Web: hanya Mythic yang unik per user (Epic/Legendary boleh menumpuk).
function isUniqueRarityWeb(rarity) {
  return rarity === 'Mythic';
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function clampFloat(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitizePoolInput(pool) {
  if (!Array.isArray(pool) || pool.length === 0 || pool.length > 500) return null;
  const seen = new Set();
  const clean = [];
  for (const entry of pool) {
    const name = String(entry?.name || '').trim().slice(0, 80);
    const anime = String(entry?.anime || '').trim().slice(0, 80);
    const tier = String(entry?.tier || '').trim();
    if (!name || !anime || !VALID_TIERS.includes(tier)) return null;
    const key = name.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    clean.push({ name, anime, tier });
  }
  return clean;
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
  const s = String(name || '').trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) >>> 0);
  return h;
}

export function calcPower(rarity, level, charName = '') {
  const base = BASE_POWER[rarity] || 40;
  const variance = String(charName || '').trim() ? hashCardName(charName) % 10 : Math.floor(Math.random() * 10);
  return base + Number(level || 1) * 10 + variance;
}

export function calcLevel(xp) {
  let lv = 1;
  while (xp >= Math.floor(20 * Math.pow(lv, 3))) lv++;
  return lv;
}

async function countCardOwners(db, charName) {
  try {
    const res = await db.execute({ sql: 'SELECT COUNT(*) AS c FROM user_cards WHERE char_name = ?', args: [charName] });
    return Number(res.rows[0]?.c || 0);
  } catch {
    return 0;
  }
}

async function getCard(db, userId, charName) {
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

// Pilih kartu tersedia: lewati milik sendiri bila unik (L/M) + stok global habis.
// Downgrade otomatis ke tier bawah. Return { picked, rarity, stockLeft } atau null.
async function pickAvailableCard(db, userId, startRarity, pools, rng, stockLimits) {
  let r = startRarity;
  while (r) {
    const pool = pools[r] || [];
    const tries = Math.max(10, pool.length * 2);
    for (let i = 0; i < tries; i++) {
      if (pool.length === 0) break;
      const cand = pool[Math.floor(rng() * pool.length)];
      if (!cand) continue;
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

function jakartaDateKey(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function getPityState(db, userId) {
  try {
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

  const xpRes = await db.execute({ sql: 'SELECT xp FROM user_stats WHERE user_id = ?', args: [String(userId)] });
  const curXp = xpRes.rows.length > 0 ? Number(xpRes.rows[0].xp) || 0 : 0;
  if (curXp < costTotal) {
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
  const paidCount = pulls.length;
  const paidTotal = n === 10 && paidCount === 10 ? costTotal : Math.ceil((costTotal / n) * paidCount);
  const newXp = Math.max(0, curXp - paidTotal) + consolationTotal;
  await db.execute({
    sql: `INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level, username = excluded.username`,
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
  // Retensi: simpan maksimal 50 riwayat per user.
  try {
    await db.execute({
      sql: `DELETE FROM web_gacha_history WHERE user_id = ? AND id NOT IN
            (SELECT id FROM web_gacha_history WHERE user_id = ? ORDER BY id DESC LIMIT 50)`,
      args: [String(userId), String(userId)],
    });
  } catch { /* non-kritis */ }
  // Misi: catat jumlah pull ke progres harian/mingguan.
  try {
    const { recordEvent } = await import('./missions.js');
    if (paidCount > 0) await recordEvent(userId, username, 'gacha', paidCount);
  } catch { /* misi non-kritis */ }
  return { pulls, costTotal: paidTotal, xpBefore: curXp, xpAfter: newXp, ...next };
}

// Ringkasan stok global tier terbatas: jumlah kartu yang masih ada stoknya.
export async function stockSummary(pool, stocks) {
  const db = getDb();
  const out = { Mythic: null, Legendary: null, Epic: null };
  try {
    const res = await db.execute({
      sql: `SELECT char_name, COUNT(*) AS c FROM user_cards WHERE rarity IN ('Mythic','Legendary','Epic') GROUP BY char_name`,
      args: [],
    });
    const owners = {};
    for (const r of res.rows) owners[String(r.char_name)] = Number(r.c) || 0;
    for (const tier of ['Mythic', 'Legendary', 'Epic']) {
      const limit = stocks?.[tier] ?? STOCK_LIMITS[tier];
      if (!Number.isFinite(limit)) { out[tier] = null; continue; }
      let left = 0;
      let total = 0;
      for (const p of pool) {
        if (p.tier !== tier) continue;
        total += 1;
        if ((owners[p.name] || 0) < limit) left += 1;
      }
      out[tier] = { left, total };
    }
  } catch { /* null = tak diketahui */ }
  return out;
}
