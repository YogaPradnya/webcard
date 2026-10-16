import { WAIFU_POOL } from '../data/waifuPool.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// JSON via require agar bisa dipakai plain Node (test) maupun Next.
const staticArt = require('../data/cardArt.json');
const cloudArt = require('../data/cardArtCloud.json');
import { getDb, readSetting } from './db.js';
import { isSchemaReady } from './schema.js';
import { genCardStats, genSecondSkill } from './battleStats.js';
import { sanitizePoolInput } from './pool.js';

export const RARITY_ORDER = { Common: 0, Rare: 1, Epic: 2, Legendary: 3, Mythic: 4 };
export const RARITY_LIST = ['Mythic', 'Legendary', 'Epic', 'Rare', 'Common'];

// Warna frame per rarity (serasi emoji bot: Mythic merah, Legendary kuning, Epic ungu, Rare biru, Common abu).
export const RARITY_COLORS = {
  Mythic: '#e5484d',
  Legendary: '#eab308',
  Epic: '#a855f7',
  Rare: '#2c67e9',
  Common: '#9aa3b2',
};

// Pool efektif: override dashboard (settings.gacha_pool) atau default 265 kartu.
// Di-cache 60 detik: sebelumnya tiap /api/cards = 1 round-trip ke Tokyo.
let _poolCache = null;
let _poolAt = 0;
async function getEffectivePool() {
  if (_poolCache && Date.now() - _poolAt < 60 * 1000) return _poolCache;
  try {
    const raw = await readSetting('gacha_pool');
    if (raw) {
      const checked = sanitizePoolInput(JSON.parse(raw));
      if (checked) { _poolCache = checked; _poolAt = Date.now(); return checked; }
    }
  } catch {
    // JSON rusak -> default
  }
  _poolCache = WAIFU_POOL; _poolAt = Date.now();
  return WAIFU_POOL;
}

// Art efektif: dibaca SEKALI lalu dipetakan (jangan query per kartu).
// Di-cache 60 detik.
let _artCache = null;
let _artAt = 0;
async function getArtMap() {
  if (_artCache && Date.now() - _artAt < 60 * 1000) return _artCache;
  let overrides = {};
  try {
    const raw = await readSetting('gacha_art');
    if (raw) {
      const parsed = JSON.parse(raw) || {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v) overrides[String(k).toLowerCase()] = v;
      }
    }
  } catch {
    // abaikan
  }
  _artCache = overrides; _artAt = Date.now();
  return overrides;
}

// Art efektif untuk SATU kartu (prioritas sama seperti getBookCards):
// override dashboard (gacha_art) -> cloudArt -> staticArt -> null.
// Dipakai showcase API agar image_url ter-backfill ke DB sehingga bot (.profil) bisa menampilkannya.
export async function getEffectiveArt(charName) {
  const key = String(charName || '').toLowerCase();
  if (!key) return null;
  const overrides = await getArtMap();
  return overrides[key] || cloudArt[key] || staticArt[key] || null;
}

// Stat battle semua kartu (1 query). Hilang -> fallback generator (tetap deterministik).
// Kolom skill2 di-backfill dari generator bila DB lama belum migrasi.
// Di-cache 60 detik (265 baris, jarang berubah).
let _statsCache = null;
let _statsAt = 0;
export async function getCardStatsMap() {
  if (_statsCache && Date.now() - _statsAt < 60 * 1000) return _statsCache;
  try {
    const res = await getDb().execute({
      sql: 'SELECT char_name, tier, role, hp, basic_dmg, skill_name, skill_dmg, cons_cost, skill_effect, skill_effect_val, skill2_name, skill2_dmg, skill2_cons, skill2_effect, skill2_effect_val FROM card_battle_stats',
      args: [],
    });
    const map = {};
    for (const r of res.rows) {
      map[String(r.char_name || '').toLowerCase()] = mapBattleStatRow(r);
    }
    _statsCache = map; _statsAt = Date.now();
    return map;
  } catch {
    // DB lama tanpa kolom skill2 (atau tanpa tabel): baca kolom lama + generate skill2.
    try {
      const res = await getDb().execute({
        sql: 'SELECT char_name, tier, role, hp, basic_dmg, skill_name, skill_dmg, cons_cost, skill_effect, skill_effect_val FROM card_battle_stats',
        args: [],
      });
      const map = {};
      for (const r of res.rows) {
        const base = mapBattleStatRow(r);
        const second = genSecondSkill({ name: base.name, tier: base.tier }, base.role, base.effect);
        map[String(base.name || '').toLowerCase()] = { ...base, ...second };
      }
      _statsCache = map; _statsAt = Date.now();
      return map;
    } catch {
      return {};
    }
  }
}

function mapBattleStatRow(r) {
  return {
    name: String(r.char_name || ''),
    tier: String(r.tier || 'Common'),
    role: String(r.role || 'Damage'),
    hp: Number(r.hp) || 60,
    basic: Number(r.basic_dmg) || 10,
    skillName: String(r.skill_name || ''),
    skill: Number(r.skill_dmg) || 20,
    cons: Number(r.cons_cost) || 3,
    effect: String(r.skill_effect || 'none'),
    effectVal: Number(r.skill_effect_val) || 0,
    skill2Name: String(r.skill2_name || ''),
    skill2: Number(r.skill2_dmg) || 0,
    cons2: Number(r.skill2_cons) || 0,
    effect2: String(r.skill2_effect || 'none'),
    effectVal2: Number(r.skill2_effect_val) || 0,
  };
}
// Migrasi kolom quantity: sekali per proses. Sebelumnya tiap /api/cards =
// 1x ALTER (selalu gagal karena kolom sudah ada) + 1x UPDATE full-scan
// (~350ms+ ke Tokyo).
let _qtyPromise = null;
let _qtyDone = false;
export async function ensureQuantityColumn() {
  if (isSchemaReady()) return; // DDL sudah diurus migrasi (0 round-trip).
  if (_qtyDone) return;
  if (_qtyPromise) { await _qtyPromise; return; }
  _qtyPromise = (async () => {
  try {
    await getDb().execute('ALTER TABLE user_cards ADD COLUMN quantity INTEGER DEFAULT 1');
  } catch { /* sudah ada */ }
  try {
    await getDb().execute('UPDATE user_cards SET quantity = 1 WHERE quantity IS NULL OR quantity < 1');
  } catch { /* abaikan */ }
  })();
  try { await _qtyPromise; _qtyDone = true; }
  finally { _qtyPromise = null; }
}

export async function getUserCollection(userId) {
  await ensureQuantityColumn();
  const res = await getDb().execute({
    sql: 'SELECT char_name, rarity, level, power, image_url, is_showcase, quantity FROM user_cards WHERE user_id = ?',
    args: [String(userId)],
  });
  const map = {};
  for (const r of res.rows) {
    map[String(r.char_name || '').toLowerCase()] = {
      rarity: String(r.rarity || 'Common'),
      level: Number(r.level) || 1,
      power: Number(r.power) || 0,
      imageUrl: r.image_url || null,
      showcase: Number(r.is_showcase) === 1,
      quantity: Math.max(1, Number(r.quantity) || 1),
    };
  }
  return map;
}

// Gabungan pool + status milik user + stat battle. Unowned tidak membawa level/power.
// Batch: 4 query total (pool, art, koleksi, stat), tanpa query per kartu.
// Cache per user 30 dtk (koleksi 265 kartu jarang berubah antar detik);
// mutasi (gacha/convert/evolve/trade) memanggil invalidateBookCache().
const _bookCache = new Map(); // userId -> { at, payload }
const BOOK_CACHE_TTL_MS = 30 * 1000;
export function invalidateBookCache(userId) {
  _bookCache.delete(String(userId));
}
export async function getBookCards(userId) {
  const key = String(userId);
  const hit = _bookCache.get(key);
  if (hit && Date.now() - hit.at < BOOK_CACHE_TTL_MS) return hit.payload;
  const [pool, artOverrides, owned, statsMap] = await Promise.all([
    getEffectivePool(),
    getArtMap(),
    getUserCollection(userId),
    getCardStatsMap(),
  ]);
  const cards = pool.map((entry) => {
    const key = entry.name.toLowerCase();
    const has = owned[key];
    const st = statsMap[key] || genCardStats(entry);
    return {
      name: entry.name,
      anime: entry.anime,
      tier: entry.tier,
      imageUrl: has?.imageUrl || artOverrides[key] || cloudArt[key] || staticArt[key] || null,
      owned: Boolean(has),
      level: has ? has.level : null,
      power: has ? has.power : null,
      quantity: has ? has.quantity : 0,
      showcase: has ? has.showcase : false,
      stats: { role: st.role, hp: st.hp, basic: st.basic, skillName: st.skillName, skill: st.skill, cons: st.cons, effect: st.effect || 'none', effectVal: st.effectVal || 0, skill2Name: st.skill2Name || '', skill2: st.skill2 || 0, cons2: st.cons2 || 0, effect2: st.effect2 || 'none', effectVal2: st.effectVal2 || 0 },
    };
  });
  cards.sort(
    (a, b) =>
      (RARITY_ORDER[b.tier] ?? 0) - (RARITY_ORDER[a.tier] ?? 0) || a.name.localeCompare(b.name),
  );
  const ownedCount = cards.filter((c) => c.owned).length;
  const out = { cards, total: cards.length, ownedCount };
  _bookCache.set(key, { at: Date.now(), payload: out });
  return out;
}
