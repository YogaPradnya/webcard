// Info skill untuk UI: label, deskripsi lengkap, dan helper targeting.
// Modul ini aman di client (tidak mengimpor DB / Node API).

const HEAL_EFFECTS = new Set(['heal', 'regen', 'energize']);

export function isHealEffect(effect) {
  return HEAL_EFFECTS.has(String(effect || 'none'));
}

export function isAllyEffect(effect) {
  const e = String(effect || 'none');
  return isHealEffect(e) || e === 'shield' || e === 'bulwark';
}

const EFFECT_LABELS = {
  none: '-',
  heavy: 'Heavy',
  crit: 'Crit',
  burn: 'Burn',
  double: 'Double',
  shield: 'Shield',
  slam: 'Stun',
  bulwark: 'Shield+',
  heal: 'Heal',
  regen: 'Regen',
  energize: 'Heal+Cons',
  surge: 'Cons+',
  weaken: 'Weaken',
  focus: 'Fokus',
  execute: 'Execute',
  splash: 'Splash',
  silence: 'Silence',
};

const EFFECT_DESCRIPTIONS = {
  none: () => 'Tidak ada efek tambahan.',
  heavy: (v) => `Damage skill ${v}%.`,
  crit: (v) => `${v}% peluang damage 200%.`,
  burn: (v) => `Damage + burn ${v}% selama 2 giliran.`,
  double: (v) => `2 pukulan, masing-masing ${v}% damage.`,
  shield: (v) => `Damage + shield ${v}% ke diri sendiri atau teman pilihan.`,
  slam: (v) => `Damage 90% + ${v}% peluang stun 1 giliran.`,
  bulwark: (v) => `Damage 70% + shield ${v}% ke diri sendiri atau teman pilihan.`,
  heal: (v) => `Memulihkan ${v}% damage skill ke satu kartu tim.`,
  regen: (v) => `Regenerasi ${v}% damage skill per giliran selama 3 giliran.`,
  energize: (v) => `Memulihkan ${v}% damage skill + tim mendapat 4 cons.`,
  surge: () => 'Damage 70% + tim mendapat 4 cons.',
  weaken: (v) => `Damage 70% + target -${v}% damage selama 2 giliran.`,
  focus: (v) => `Damage 70% + skill sendiri berikutnya +${v}%.`,
  execute: (v) => `Serang target aktif. Jika HP target ≤35%, damage +${v}%.`,
  splash: (v) => `Damage utama ke target aktif, lalu ${v}% damage ke semua cadangan lawan.`,
  silence: (v) => `Damage 75% + ${v}% peluang target tidak bisa memakai skill selama 1 giliran.`,
};

export function effectLabel(effect) {
  const e = String(effect || 'none');
  return EFFECT_LABELS[e] || e;
}

export function effectDescription(effect, val) {
  const e = String(effect || 'none');
  const fn = EFFECT_DESCRIPTIONS[e];
  if (!fn) return 'Efek khusus.';
  return fn(Number(val) || 0);
}

/** Detail satu slot skill dari fighter battle (state server). */
export function skillDetail(fighter, slot = 1) {
  if (!fighter) return null;
  const isSecond = Number(slot) === 2;
  const effect = isSecond ? fighter.effect2 : fighter.effect;
  const val = isSecond ? fighter.effectVal2 : fighter.effectVal;
  return {
    slot: isSecond ? 2 : 1,
    name: (isSecond ? fighter.skill2Name : fighter.skillName) || (isSecond ? 'Skill 2' : 'Skill 1'),
    cons: isSecond ? fighter.cons2 : fighter.cons,
    dmg: isSecond ? fighter.skill2 : fighter.skill,
    effect: effect || 'none',
    val: Number(val) || 0,
    label: effectLabel(effect),
    description: effectDescription(effect, val),
  };
}
