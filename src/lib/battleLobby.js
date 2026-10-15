// Cache kartu owned battle (stale-while-revalidate, TTL 5 menit).
// Murni (storage di-inject agar bisa di-unit-test plain node).

export const BATTLE_CARDS_CACHE_KEY = 'battle_cards_owned_v1';
export const BATTLE_CARDS_CACHE_TTL_MS = 5 * 60 * 1000;

function getStorage(storage) {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* abaikan */ }
  return null;
}

export function readBattleCardsCache(storage, now = Date.now()) {
  try {
    const store = getStorage(storage);
    if (!store) return null;
    const raw = store.getItem(BATTLE_CARDS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.cards)) return null;
    if (now - (parsed.at || 0) > BATTLE_CARDS_CACHE_TTL_MS) return null;
    return parsed.cards;
  } catch {
    return null;
  }
}

export function writeBattleCardsCache(all, storage, now = Date.now()) {
  try {
    const store = getStorage(storage);
    if (!store) return;
    store.setItem(BATTLE_CARDS_CACHE_KEY, JSON.stringify({ at: now, cards: all || [] }));
  } catch { /* abaikan: cache best-effort */ }
}
