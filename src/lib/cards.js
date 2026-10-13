import { WAIFU_POOL, VALID_TIERS } from '../data/waifuPool.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// JSON via require agar bisa dipakai plain Node (test) maupun Next.
const staticArt = require('../data/cardArt.json');
const cloudArt = require('../data/cardArtCloud.json');
import { getDb, readSetting } from './db.js';
import { genCardStats, genSecondSkill } from './battleStats.js';

export const RARITY_ORDER = { Common: 0, Rare: 1, Epic: 2, Legendary: 3, Mythic: 4 };
export const RARITY_LIST = ['Mythic', 'Legendary', 'Epic', 'Rare', 'Common'];

// Warna frame per rarity (serasi emoji bot: Mythic merah, Legendary kuning, Epic ungu, Rare biru, Common abu).
export const RARITY_COLORS = {
  Mythic: '#ef4444',
  Legendary: '#eab308',
  Epic: '#a855f7',
  Rare: '#3b82f6',
  Common: '#9ca3af',
};

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

// Pool efektif: override dashboard (settings.gacha_pool) atau default 200 kartu.
async function getEffectivePool() {
  try {
    const raw = await readSetting('gacha_pool');
    if (raw) {
      const checked = sanitizePoolInput(JSON.parse(raw));
      if (checked) return checked;
    }
  } catch {
    // JSON rusak -> default
  }
  return WAIFU_POOL;
}

// Art efektif: dibaca SEKALI lalu dipetakan (jangan query per kartu).
async function getArtMap() {
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
export async function getCardStatsMap() {
  try {
    const res = await getDb().execute({
      sql: 'SELECT char_name, tier, role, hp, basic_dmg, skill_name, skill_dmg, cons_cost, skill_effect, skill_effect_val, skill2_name, skill2_dmg, skill2_cons, skill2_effect, skill2_effect_val FROM card_battle_stats',
      args: [],
    });
    const map = {};
    for (const r of res.rows) {
      map[String(r.char_name || '').toLowerCase()] = mapBattleStatRow(r);
    }
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
export async function ensureQuantityColumn() {
  try {
    await getDb().execute('ALTER TABLE user_cards ADD COLUMN quantity INTEGER DEFAULT 1');
  } catch { /* sudah ada */ }
  try {
    await getDb().execute('UPDATE user_cards SET quantity = 1 WHERE quantity IS NULL OR quantity < 1');
  } catch { /* abaikan */ }
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
export async function getBookCards(userId) {
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
  return { cards, total: cards.length, ownedCount };
}
