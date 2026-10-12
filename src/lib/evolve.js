// Aturan Evolusi manual (mirror bot src/database/cardsRepo.js EVO_COST).
// need = copy yang harus dimiliki, consume = copy yang dipakai (sisa 1 jadi badan).
// Legendary/Mythic tidak bisa evo. ★5 unlock skill kedua.

export const MAX_CARD_LEVEL = 5;

export const EVO_COST = {
  1: { need: 3, consume: 2 },
  2: { need: 3, consume: 2 },
  3: { need: 3, consume: 2 },
  4: { need: 5, consume: 4 },
};

export function checkEvoCost(level, quantity) {
  const cost = EVO_COST[Number(level)];
  if (!cost) return { ok: false, error: 'LEVEL_MAX' };
  const have = Math.max(0, Math.floor(Number(quantity) || 0));
  if (have < cost.need) return { ok: false, error: 'NEED_MORE', need: cost.need, have };
  return { ok: true, need: cost.need, consume: cost.consume };
}

export function isEvoBlockedRarity(rarity) {
  return rarity === 'Legendary' || rarity === 'Mythic';
}
