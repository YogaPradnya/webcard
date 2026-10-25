// Stat battle per kartu. Deterministik dari nama+tier: sama di semua user, permanen.
// Disimpan di Turso (card_battle_stats); generator dipakai untuk seed + fallback.
import { hashNameLower as hashName } from './hash.js';
import { getCardSkillOverride } from '../data/cardBattleSkills.js';

export { hashName };

// Role lama: Damage/Tank/Support/Assist.
// Role baru: Support lama -> Healer, Assist lama -> Support.
// Tambahan: Assassin + Mage. Kartu baru membawa `role` eksplisit di pool.
export const ROLES = ['Damage', 'Tank', 'Healer', 'Support', 'Assassin', 'Mage'];

const TIER_HP = { Common: 70, Rare: 100, Epic: 140, Legendary: 180, Mythic: 220 };
const TIER_BASIC = { Common: 10, Rare: 14, Epic: 18, Legendary: 24, Mythic: 30 };
const TIER_SKILL = { Common: 25, Rare: 35, Epic: 50, Legendary: 70, Mythic: 95 };
// Cons flat: skill1 = 6, skill2 (finisher) = 8 untuk semua tier & role.
const SKILL1_CONS = 6;
const SKILL2_CONS = 8;

// Mult HP hanya dipakai role baru; role lama tetap 1 agar stat 265 kartu lama tidak berubah.
const ROLE_HP_MULT = { Damage: 1, Tank: 1, Healer: 1, Support: 1, Assassin: 0.85, Mage: 0.9 };
const ROLE_BASIC_MULT = { Damage: 1.3, Tank: 0.9, Healer: 0.7, Support: 0.7, Assassin: 1.45, Mage: 0.8 };
const ROLE_SKILL_MULT = { Damage: 1.3, Tank: 1.0, Healer: 1.2, Support: 0.6, Assassin: 1.35, Mage: 1.15 };

const SKILL_NAMES = {
  Damage: ['Tebasan', 'Hantaman', 'Amukan', 'Serangan'],
  Tank: ['Benteng', 'Gempuran', 'Perisai'],
  Healer: ['Doa', 'Penyembuh', 'Cahaya'],
  Support: ['Taktik', 'Semangat', 'Dorongan'],
  Assassin: ['Sabetan', 'Tikaman', 'Eksekusi', 'Bayangan'],
  Mage: ['Sihir', 'Ledakan', 'Mantra', 'Bola Api'],
};

// Efek khusus per role (mekanik beda, bukan cuma angka).
// val = parameter persen (mis. 140 = 140%).
export const SKILL_EFFECTS = {
  Damage: [
    { effect: 'heavy', val: 140 }, // damage 140%
    { effect: 'crit', val: 25 }, // 25% peluang damage 200%
    { effect: 'burn', val: 30 }, // damage + burn 30%/giliran 2 giliran
    { effect: 'double', val: 60 }, // 2 pukulan @60%
  ],
  Tank: [
    { effect: 'shield', val: 60 }, // damage + shield 60% ke diri sendiri
    { effect: 'slam', val: 35 }, // damage 90% + 35% stun 1 giliran
    { effect: 'bulwark', val: 50 }, // damage 70% + shield 50% ke diri sendiri
  ],
  Healer: [
    { effect: 'heal', val: 70 }, // heal instan 70%
    { effect: 'regen', val: 22 }, // heal 22%/giliran 3 giliran
    { effect: 'energize', val: 45 }, // heal 45% + tim +2 cons
  ],
  Support: [
    { effect: 'surge', val: 50 }, // damage 70% + tim +2 cons
    { effect: 'weaken', val: 30 }, // damage 70% + musuh -30% damage 2 giliran
    { effect: 'focus', val: 40 }, // damage 70% + skill sendiri berikutnya +40%
  ],
  Assassin: [
    { effect: 'execute', val: 60 }, // bonus +60% bila HP target <= 35%
    { effect: 'crit', val: 25 },
    { effect: 'double', val: 60 },
  ],
  Mage: [
    { effect: 'splash', val: 25 }, // 25% damage ke semua cadangan lawan
    { effect: 'silence', val: 50 }, // 50% peluang skill lawan terkunci 1 giliran
    { effect: 'burn', val: 30 },
  ],
};

// Hash lama sengaja dipertahankan: 0-6 Damage, 7-12 Tank, 13-16 Support(heal), 17-19 Assist.
// Nama role baru dipetakan agar stat/efek 265 kartu lama tetap identik.
export function roleForCard(name) {
  const r = hashName(name) % 20;
  if (r <= 6) return 'Damage';
  if (r <= 12) return 'Tank';
  if (r <= 16) return 'Healer';
  return 'Support';
}

/** Role eksplisit dari pool (kartu baru) atau hash lama (kartu lama). */
export function resolveRole(entry) {
  if (entry && typeof entry === 'object' && ROLES.includes(entry.role)) return entry.role;
  const name = typeof entry === 'string' ? entry : entry?.name;
  return roleForCard(name);
}

export function genCardStats(entry) {
  const name = entry.name;
  const tier = entry.tier;
  const role = resolveRole(entry);
  const h = hashName(name + tier);
  const firstWord = String(name).trim().split(/\s+/)[0] || name;
  const skillPool = SKILL_NAMES[role] || SKILL_NAMES.Damage;
  const override = getCardSkillOverride(name);
  const skillName = override?.skill1?.name || `${skillPool[h % skillPool.length]} ${firstWord}`;
  const hpBase = (TIER_HP[tier] ?? 70) + (h % 21);
  const hp = Math.max(1, Math.round(hpBase * (ROLE_HP_MULT[role] ?? 1)));
  const basic = Math.max(
    5,
    Math.round((TIER_BASIC[tier] ?? 10) * (ROLE_BASIC_MULT[role] ?? 1) + (h % 5)),
  );
  const skill = Math.max(
    10,
    Math.round((TIER_SKILL[tier] ?? 25) * (ROLE_SKILL_MULT[role] ?? 1) + (h % 7)),
  );
  const cons = SKILL1_CONS;
  const effectPool = SKILL_EFFECTS[role] || SKILL_EFFECTS.Damage;
  const picked = override?.skill1
    ? { effect: override.skill1.effect, val: override.skill1.val }
    : effectPool[h % effectPool.length];
  const second = genSecondSkill(entry, role, picked.effect);
  return { name, tier, role, hp, basic, skillName, skill, cons, effect: picked.effect, effectVal: picked.val, ...second };
}

// Skill kedua = finisher (lebih OP dari skill1): damage ~130% + efek beda.
export function genSecondSkill(entry, role, firstEffect) {
  const name = entry.name;
  const tier = entry.tier;
  const resolvedRole = role || resolveRole(entry);
  const h = hashName(`${name}${tier}:skill2`);
  const firstWord = String(name).trim().split(/\s+/)[0] || name;
  const skillPool = SKILL_NAMES[resolvedRole] || SKILL_NAMES.Damage;
  const override = getCardSkillOverride(name);
  const skill2 = Math.max(
    10,
    Math.round((TIER_SKILL[tier] ?? 25) * (ROLE_SKILL_MULT[resolvedRole] ?? 1) * 1.3 + (h % 7)),
  );

  if (override?.skill2) {
    return {
      skill2Name: override.skill2.name,
      skill2,
      cons2: SKILL2_CONS,
      effect2: override.skill2.effect,
      effectVal2: override.skill2.val,
    };
  }

  const skill2Name = `${skillPool[(h + 1) % skillPool.length]} ${firstWord} II`;
  const effectPool = SKILL_EFFECTS[resolvedRole] || SKILL_EFFECTS.Damage;
  let picked = effectPool[(h + 1) % effectPool.length];
  if (effectPool.length > 1 && picked.effect === firstEffect) {
    picked = effectPool[(h + 2) % effectPool.length];
  }
  return { skill2Name, skill2, cons2: SKILL2_CONS, effect2: picked.effect, effectVal2: picked.val };
}
