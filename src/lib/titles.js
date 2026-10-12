// Gelar profil: 10 gelar Mythic (satu per kartu Mythic) + 5 gelar koleksi tier lengkap.
// Earned bila user punya kartunya / koleksi tier-nya penuh.

export const MYTHIC_TITLES = {
  'Sung Jinwoo': 'Shadow Monarch',
  'Rimuru Tempest': 'Demon Slime',
  'Anos Voldigoad': 'Demon King',
  'Ainz Ooal Gown': 'Overlord',
  'Gilgamesh': 'King of Heroes',
  'Madara Uchiha': 'Ghost of Uchiha',
  'Pain': 'God of Pain',
  'Meruem': 'Chimera King',
  'All Might': 'Symbol of Peace',
  'Guts': 'Black Swordsman',
};

export const TIER_TITLES = {
  Common: 'Kolektor Common',
  Rare: 'Kolektor Rare',
  Epic: 'Kolektor Epic',
  Legendary: 'Legenda Hidup',
  Mythic: 'Dewa Kartu',
};

// pool: [{name, tier}], ownedMap: { lowerName: true }
export function slugCard(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function iconFor(item) {
  if (item.kind === 'mythic') return `/titles/mythic-${slugCard(item.cardName)}.svg`;
  return `/titles/tier-${String(item.tier || '').toLowerCase()}.svg`;
}

// Ikon badge untuk sebuah judul gelar (atau null bila tidak dikenal).
// Dipakai chat agar ikon gelar yang dipajang ikut tampil di samping nama.
export function iconForTitle(title) {
  const t = String(title || '');
  if (!t) return null;
  for (const [cardName, name] of Object.entries(MYTHIC_TITLES)) {
    if (name === t) return `/titles/mythic-${slugCard(cardName)}.svg`;
  }
  for (const [tier, name] of Object.entries(TIER_TITLES)) {
    if (name === t) return `/titles/tier-${String(tier).toLowerCase()}.svg`;
  }
  return null;
}

export function computeTitles(pool, ownedMap) {
  const totalByTier = {};
  const ownedByTier = {};
  for (const p of pool) {
    totalByTier[p.tier] = (totalByTier[p.tier] || 0) + 1;
    if (ownedMap[String(p.name).toLowerCase()]) {
      ownedByTier[p.tier] = (ownedByTier[p.tier] || 0) + 1;
    }
  }
  const earned = [];
  const locked = [];

  for (const [cardName, title] of Object.entries(MYTHIC_TITLES)) {
    const has = Boolean(ownedMap[String(cardName).toLowerCase()]);
    const item = { id: `mythic:${cardName}`, kind: 'mythic', title, cardName, progress: has ? 1 : 0, total: 1, icon: `/titles/mythic-${slugCard(cardName)}.svg` };
    if (has) earned.push(item);
    else locked.push(item);
  }

  for (const [tier, title] of Object.entries(TIER_TITLES)) {
    const owned = ownedByTier[tier] || 0;
    const total = totalByTier[tier] || 0;
    const done = total > 0 && owned >= total;
    const item = { id: `tier:${tier}`, kind: 'tier', title, tier, progress: owned, total, icon: `/titles/tier-${String(tier).toLowerCase()}.svg` };
    if (done) earned.push(item);
    else locked.push(item);
  }

  return { earned, locked, totalByTier, ownedByTier };
}

import { getDb } from './db.js';

// Gelar web HANYA untuk web (kolom user_stats.web_title).
// Bot (.profil) tetap memakai custom_title (gelar costume) dan tidak tersentuh.
export async function ensureWebTitleColumn() {
  try {
    await getDb().execute('ALTER TABLE user_stats ADD COLUMN web_title TEXT DEFAULT NULL');
  } catch { /* sudah ada */ }
}

// Semua judul gelar web (untuk migrasi satu kali: custom_title yang isinya
// gelar web dipindah ke web_title agar .profil bot bersih kembali).
export function allWebTitles() {
  return [...Object.values(MYTHIC_TITLES), ...Object.values(TIER_TITLES)];
}
