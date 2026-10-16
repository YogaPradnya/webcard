// Nilai & aturan trade bundle (murni, dipakai server + klien).
export const TRADE_TIER_ORDER = { Common: 0, Rare: 1, Epic: 2, Legendary: 3, Mythic: 4 };
export const TRADE_POINT = { Common: 1, Rare: 2, Epic: 4, Legendary: 8, Mythic: 16 };
export const MAX_TRADE_CARDS_PER_SIDE = 10;

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
