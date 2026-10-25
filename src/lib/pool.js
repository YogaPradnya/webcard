import { VALID_TIERS } from '../data/waifuPool.js';

const POOL_ROLES = ['Damage', 'Tank', 'Healer', 'Support', 'Assassin', 'Mage'];

export function sanitizePoolInput(pool) {
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
    // Role opsional: pertahankan role eksplisit agar stat fallback (mis. DB
    // belum di-seed) tidak kembali ke hash role lama. Pool lama tanpa role
    // tetap valid dan memakai hash deterministik.
    const role = String(entry?.role || '').trim();
    clean.push(POOL_ROLES.includes(role) ? { name, anime, tier, role } : { name, anime, tier });
  }
  return clean;
}
