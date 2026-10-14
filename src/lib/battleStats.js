// Stat battle per kartu. Deterministik dari nama+tier: sama di semua user, permanen.
// Disimpan di Turso (card_battle_stats); generator dipakai untuk seed + fallback.

export const ROLES = ['Damage', 'Tank', 'Support', 'Assist'];

const TIER_HP = { Common: 70, Rare: 100, Epic: 140, Legendary: 180, Mythic: 220 };
const TIER_BASIC = { Common: 10, Rare: 14, Epic: 18, Legendary: 24, Mythic: 30 };
const TIER_SKILL = { Common: 25, Rare: 35, Epic: 50, Legendary: 70, Mythic: 95 };
// Cons flat: skill1 = 6, skill2 (finisher) = 8 untuk semua tier & role.
const SKILL1_CONS = 6;
const SKILL2_CONS = 8;

const ROLE_BASIC_MULT = { Damage: 1.3, Tank: 0.9, Support: 0.7, Assist: 0.7 };
const ROLE_SKILL_MULT = { Damage: 1.3, Tank: 1.0, Support: 1.2, Assist: 0.6 };

const SKILL_NAMES = {
  Damage: ['Tebasan', 'Hantaman', 'Amukan', 'Serangan'],
  Tank: ['Benteng', 'Gempuran', 'Perisai'],
  Support: ['Doa', 'Penyembuh', 'Cahaya'],
  Assist: ['Taktik', 'Semangat', 'Dorongan'],
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
  Support: [
    { effect: 'heal', val: 70 }, // heal instan 70%
    { effect: 'regen', val: 22 }, // heal 22%/giliran 3 giliran
    { effect: 'energize', val: 45 }, // heal 45% + tim +2 cons
  ],
  Assist: [
    { effect: 'surge', val: 50 }, // damage 50% + tim +2 cons
    { effect: 'weaken', val: 30 }, // damage 70% + musuh -30% damage 2 giliran
    { effect: 'focus', val: 40 }, // damage 70% + skill sendiri berikutnya +40%
  ],
};

export function hashName(name) {
  const s = String(name || '').trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) >>> 0);
  return h;
}

// Role: Damage 35% / Tank 30% / Support 20% / Assist 15%.
export function roleForCard(name) {
  const r = hashName(name) % 20;
  if (r <= 6) return 'Damage';
  if (r <= 12) return 'Tank';
  if (r <= 16) return 'Support';
  return 'Assist';
}

export function genCardStats(entry) {
  const name = entry.name;
  const tier = entry.tier;
  const role = roleForCard(name);
  const h = hashName(name + tier);
  const firstWord = String(name).trim().split(/\s+/)[0] || name;
  const skillPool = SKILL_NAMES[role];
  const skillName = `${skillPool[h % skillPool.length]} ${firstWord}`;
  const hp = (TIER_HP[tier] ?? 70) + (h % 21);
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
  const picked = effectPool[h % effectPool.length];
  const second = genSecondSkill(entry, role, picked.effect);
  return { name, tier, role, hp, basic, skillName, skill, cons, effect: picked.effect, effectVal: picked.val, ...second };
}

// Skill kedua = finisher (lebih OP dari skill1): damage ~130% + efek beda.
export function genSecondSkill(entry, role, firstEffect) {
  const name = entry.name;
  const tier = entry.tier;
  const resolvedRole = role || roleForCard(name);
  const h = hashName(`${name}${tier}:skill2`);
  const firstWord = String(name).trim().split(/\s+/)[0] || name;
  const skillPool = SKILL_NAMES[resolvedRole];
  const skill2Name = `${skillPool[(h + 1) % skillPool.length]} ${firstWord} II`;
  const skill2 = Math.max(
    10,
    Math.round((TIER_SKILL[tier] ?? 25) * (ROLE_SKILL_MULT[resolvedRole] ?? 1) * 1.3 + (h % 7)),
  );
  const cons2 = SKILL2_CONS;
  const effectPool = SKILL_EFFECTS[resolvedRole] || SKILL_EFFECTS.Damage;
  let picked = effectPool[(h + 1) % effectPool.length];
  if (effectPool.length > 1 && picked.effect === firstEffect) {
    picked = effectPool[(h + 2) % effectPool.length];
  }
  return { skill2Name, skill2, cons2, effect2: picked.effect, effectVal2: picked.val };
}
