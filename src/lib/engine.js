// Engine battle kartu: 3v3 bergiliran, cons tim, role Damage/Tank/Support/Assist.
// Skill punya efek khusus per kartu + status (burn/regen/shield/stun/weaken/focus)
// + kombo chain (skill beruntun +25%). Murni (tanpa I/O).
//
// Targeting manual (tap-to-target):
// - basic & skill ofensif: HANYA boleh ke kartu AKTIF lawan (action.target wajib == foe.active).
// - heal/regen/energize (Support): ke kartu tim sendiri pilihan (action.ally = index).
// - shield/bulwark (Tank): damage ke aktif lawan + shield ke kartu tim pilihan.
// Tanpa target (AI/timeout/room lama) = perilaku lama: aktif lawan / heal otomatis / shield diri.

export const MAX_CONS = 10;
export const MAX_TURNS = 30;

// Skill2 unlock: Legendary/Mythic langsung buka; tier lain wajib kartu ★5.
export function isSkill2Unlocked(f) {
  if (!f) return false;
  const t = String(f.tier || 'Common');
  if (t === 'Legendary' || t === 'Mythic') return true;
  return (Number(f.level) || 1) >= 5;
}

export function makeFighter(stat) {
  return {
    name: stat.name,
    role: stat.role,
    tier: stat.tier || 'Common',
    level: Number(stat.level) || 1,
    maxHp: stat.hp,
    hp: stat.hp,
    basic: stat.basic,
    skillName: stat.skillName,
    skill: stat.skill,
    cons: stat.cons,
    effect: stat.effect || 'none',
    effectVal: stat.effectVal ?? 0,
    // Skill kedua (unlock ★5; null di room lama / kartu tanpa skill2 = terkunci).
    skill2Name: stat.skill2Name || null,
    skill2: stat.skill2 || 0,
    cons2: stat.cons2 || 0,
    effect2: stat.effect2 || 'none',
    effectVal2: stat.effectVal2 ?? 0,
    alive: true,
    burn: null, // { dmg, turns }
    regen: null, // { amount, turns }
    shield: 0,
    stun: false,
    weaken: 0, // sisa giliran damage -30%
    focus: false, // skill berikutnya +40%
  };
}

function makeTeam(stats) {
  const fighters = stats.map(makeFighter);
  const assistCount = fighters.filter((f) => f.role === 'Assist').length;
  return { fighters, active: 0, cons: 0, assistBonus: Math.min(assistCount, 2), lastWasSkill: false };
}

function aliveBench(team) {
  return team.fighters.map((f, i) => ({ f, i })).filter(({ f, i }) => f.alive && i !== team.active);
}

function teamAliveHp(team) {
  return team.fighters.reduce((a, f) => a + (f.alive ? f.hp : 0), 0);
}

function teamMaxHp(team) {
  return team.fighters.reduce((a, f) => a + f.maxHp, 0);
}

function healTarget(team) {
  const cands = team.fighters.filter((f) => f.alive && f.hp < f.maxHp);
  if (cands.length === 0) return null;
  return cands.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
}

function variance(rng) {
  return 0.9 + rng() * 10 * 0.02; // 0.9 - 1.1 (rng() < 1)
}

export function createBattle(playerStats, enemyStats, first = 'player') {
  const battle = {
    player: makeTeam(playerStats),
    enemy: makeTeam(enemyStats),
    turn: first,
    turnCount: 0,
    over: false,
    winner: null,
    log: [{ t: 0, type: 'start', first }],
  };
  // Kompensasi giliran kedua: mulai dengan 2 cons.
  battle[first === 'player' ? 'enemy' : 'player'].cons = 2;
  battle.log.push({ t: 0, type: 'cons', side: first === 'player' ? 'enemy' : 'player', cons: 2 });
  return battle;
}

function checkEnd(battle) {
  const pAlive = battle.player.fighters.some((f) => f.alive);
  const eAlive = battle.enemy.fighters.some((f) => f.alive);
  if (!pAlive || !eAlive) {
    battle.over = true;
    battle.winner = pAlive ? 'you' : 'ai';
    battle.log.push({ t: battle.turnCount, type: 'end', winner: battle.winner });
    return true;
  }
  return false;
}

function replaceActive(battle, side) {
  const team = battle[side];
  if (checkEnd(battle)) return;
  const bench = aliveBench(team);
  if (bench.length === 0) {
    checkEnd(battle);
    return;
  }
  team.active = bench[0].i;
  battle.log.push({ t: battle.turnCount, type: 'switch', side, name: team.fighters[team.active].name, forced: true });
}

function markKo(battle, side, fighter) {
  if (!fighter.alive) return;
  fighter.hp = 0;
  fighter.alive = false;
  fighter.burn = null;
  fighter.regen = null;
  battle.log.push({ t: battle.turnCount, type: 'ko', side, name: fighter.name });
  const team = battle[side];
  if (team.fighters[team.active] === fighter) replaceActive(battle, side);
  else checkEnd(battle);
}

// Terapkan damage dengan shield. Return { dealt, absorbed }.
function dealDamage(target, raw) {
  const amount = Math.max(1, Math.round(raw));
  const absorbed = Math.min(target.shield, amount);
  target.shield -= absorbed;
  const dealt = amount - absorbed;
  target.hp = Math.max(0, target.hp - dealt);
  return { dealt, absorbed };
}

// Tick status tim yang bergerak (burn/regen/weaken). Return false bila battle selesai.
function tickStatuses(battle, side) {
  const team = battle[side];
  for (const f of team.fighters) {
    if (!f.alive) continue;
    if (f.burn && f.burn.turns > 0) {
      const dmg = Math.min(f.hp, f.burn.dmg);
      f.hp -= dmg;
      battle.log.push({ t: battle.turnCount, type: 'dot', side, target: f.name, amount: dmg, effect: 'burn' });
      f.burn.turns -= 1;
      if (f.burn.turns <= 0) f.burn = null;
      if (f.hp <= 0) markKo(battle, side, f);
      if (battle.over) return false;
    }
    if (f.alive && f.regen && f.regen.turns > 0) {
      const amount = Math.min(f.maxHp - f.hp, f.regen.amount);
      f.hp += amount;
      battle.log.push({ t: battle.turnCount, type: 'hot', side, target: f.name, amount, effect: 'regen' });
      f.regen.turns -= 1;
      if (f.regen.turns <= 0) f.regen = null;
    }
    if (f.weaken > 0) f.weaken -= 1;
  }
  return true;
}

// Eksekusi skill (slot 1 atau 2, mekanik identik). Return false bila ilegal.
// sk = { name, dmg, cons, effect, val }. Log type tetap 'skill' + slot agar UI lama kompatibel.
// ally = fighter tim sendiri pilihan (untuk heal/shield), null = otomatis (AI/kompatibel).
function runSkill(battle, side, actor, foeTarget, atkMult, combo, sk, slot, rng, ally) {
  const me = battle[side];
  if (me.cons < sk.cons) return false;
  me.cons -= sk.cons;
  me.lastWasSkill = true;
  const comboMult = combo ? 1.25 : 1;
  const focusMult = actor.focus ? 1.4 : 1;
  actor.focus = false;
  const fx = sk.effect;
  const val = sk.val;
  const base = sk.dmg * variance(rng);

  // --- Support: heal (tidak ada damage, target = teman pilihan) ---
  if (actor.role === 'Support') {
    const target = ally && ally.alive ? ally : healTarget(me);
    if (!target || !target.alive) {
      me.cons = Math.min(MAX_CONS, me.cons + sk.cons); // batal: kembalikan
      me.lastWasSkill = false;
      return false;
    } else if (fx === 'regen') {
      const amount = Math.round(sk.dmg * 0.22 * comboMult);
      target.regen = { amount, turns: 3 };
      battle.log.push({
        t: battle.turnCount, type: 'regen', side, name: actor.name,
        skill: sk.name, slot, target: target.name, amount, turns: 3,
        cons: me.cons, combo, effect: fx,
      });
      return true;
    } else {
      // heal / energize: target harus masih terluka.
      if (target.hp >= target.maxHp) {
        me.cons = Math.min(MAX_CONS, me.cons + sk.cons); // batal: kembalikan
        me.lastWasSkill = false;
        return false;
      }
      const mult = fx === 'energize' ? 0.45 : 0.7;
      const amount = Math.min(target.maxHp - target.hp, Math.round(base * mult * comboMult));
      target.hp += amount;
      if (fx === 'energize') me.cons = Math.min(MAX_CONS, me.cons + 2);
      battle.log.push({
        t: battle.turnCount, type: 'heal', side, name: actor.name,
        skill: sk.name, slot, target: target.name, amount, cons: me.cons,
        combo, effect: fx,
      });
      return true;
    }
  } else {
    // --- Damage/Tank/Assist: serang kartu aktif lawan dengan efek ---
    let dmg = base * atkMult * comboMult * focusMult;
    const ev = {
      t: battle.turnCount, type: 'skill', side, name: actor.name,
      skill: sk.name, slot, target: foeTarget.name, cons: me.cons,
      combo, effect: fx,
    };
    if (fx === 'heavy') dmg *= val / 100;
    else if (fx === 'slam') dmg *= 0.9;
    else if (fx === 'bulwark') dmg *= 0.7;
    else if (fx === 'surge' || fx === 'weaken' || fx === 'focus') dmg *= 0.7;
    else if (fx === 'double') dmg *= val / 100;

    if (fx === 'crit' && rng() * 100 < val) {
      dmg *= 2;
      ev.crit = true;
    }

    const hits = fx === 'double' ? [dmg, dmg] : [dmg];
    let totalDealt = 0;
    let totalAbsorbed = 0;
    for (const h of hits) {
      const { dealt, absorbed } = dealDamage(foeTarget, h);
      totalDealt += dealt;
      totalAbsorbed += absorbed;
      if (foeTarget.hp <= 0) break;
    }
    ev.dmg = totalDealt;
    ev.absorbed = totalAbsorbed;

    // Efek sekunder.
    if (fx === 'burn') {
      foeTarget.burn = { dmg: Math.round(sk.dmg * (val / 100)), turns: 2 };
      ev.status = 'burn';
    } else if (fx === 'shield' || fx === 'bulwark') {
      // Shield ke teman pilihan (default: diri sendiri bila tanpa pilihan).
      const dest = ally && ally.alive ? ally : actor;
      const amount = Math.round(sk.dmg * (val / 100));
      dest.shield += amount;
      ev.status = 'shield';
      ev.allyTarget = dest.name;
      ev.shield = amount;
    } else if (fx === 'slam' && rng() * 100 < val) {
      foeTarget.stun = true;
      ev.status = 'stun';
    } else if (fx === 'surge') {
      me.cons = Math.min(MAX_CONS, me.cons + 2);
      ev.status = 'surge';
    } else if (fx === 'weaken') {
      foeTarget.weaken = 2;
      ev.status = 'weaken';
    } else if (fx === 'focus') {
      actor.focus = true;
      ev.status = 'focus';
    }
    battle.log.push(ev);
    if (foeTarget.hp <= 0) markKo(battle, side === 'player' ? 'enemy' : 'player', foeTarget);
    return true;
  }
}

// Satu aksi kartu aktif. Return false bila aksi ilegal.
export function act(battle, side, action, rng = Math.random) {
  if (battle.over) return false;
  const me = battle[side];
  const foe = battle[side === 'player' ? 'enemy' : 'player'];
  const actor = me.fighters[me.active];
  if (!actor.alive) return false;

  me.cons = Math.min(MAX_CONS, me.cons + 1 + me.assistBonus);
  battle.turnCount += 1;
  battle.turn = side;
  const rage = 1 + 0.5 * Math.floor(battle.turnCount / 20);

  if (!tickStatuses(battle, side)) return true;
  if (battle.over) return true;
  if (!actor.alive) return true; // mati kena burn sendiri

  if (actor.stun) {
    actor.stun = false;
    me.lastWasSkill = false;
    battle.log.push({ t: battle.turnCount, type: 'stun', side, name: actor.name });
    return true;
  }

  if (action?.type === 'switch') {
    const target = me.fighters[action.to];
    if (!target || !target.alive || action.to === me.active) return false;
    me.active = action.to;
    me.lastWasSkill = false;
    battle.log.push({ t: battle.turnCount, type: 'switch', side, name: target.name, forced: false });
    return true;
  }

  const atkMult = (actor.weaken > 0 ? 0.7 : 1) * rage;
  // Target lawan: HANYA kartu aktif (dipilih via ketuk). Tanpa target = aktif (AI/timeout/room lama).
  let foeIdx = foe.active;
  if (action && action.target !== undefined && action.target !== null) {
    foeIdx = Number(action.target);
    if (!Number.isInteger(foeIdx)) return false;
  }
  if (foeIdx !== foe.active) return false;
  const foeTarget = foe.fighters[foeIdx];
  if (!foeTarget || !foeTarget.alive) return false;
  // Target teman (heal/shield manual). Tanpa ally = otomatis (AI/kompatibel).
  let ally = null;
  if (action && action.ally !== undefined && action.ally !== null) {
    const allyIdx = Number(action.ally);
    if (!Number.isInteger(allyIdx) || !me.fighters[allyIdx] || !me.fighters[allyIdx].alive) return false;
    ally = me.fighters[allyIdx];
  }
  const combo = me.lastWasSkill;

  if (action?.type === 'skill' || action?.type === 'skill2') {
    const slot = action.type === 'skill2' ? 2 : 1;
    if (slot === 2 && !isSkill2Unlocked(actor)) return false; // terkunci (bukan ★5 / tier rendah)
    const sk = slot === 2
      ? { name: actor.skill2Name, dmg: actor.skill2, cons: actor.cons2, effect: actor.effect2, val: actor.effectVal2 }
      : { name: actor.skillName, dmg: actor.skill, cons: actor.cons, effect: actor.effect, val: actor.effectVal };
    if (!sk.name || !(sk.dmg > 0)) return false; // skill2 terkunci (belum ★5 / room lama)
    return runSkill(battle, side, actor, foeTarget, atkMult, combo, sk, slot, rng, ally);
  }

  // Default: ATK biasa ke kartu aktif lawan (+1 cons).
  const { dealt, absorbed } = dealDamage(foeTarget, actor.basic * variance(rng) * atkMult);
  me.cons = Math.min(MAX_CONS, me.cons + 1);
  me.lastWasSkill = false;
  battle.log.push({
    t: battle.turnCount, type: 'basic', side, name: actor.name,
    target: foeTarget.name, dmg: dealt, absorbed, cons: me.cons,
  });
  if (foeTarget.hp <= 0) markKo(battle, side === 'player' ? 'enemy' : 'player', foeTarget);
  return true;
}

// Heuristik AI: bunuh bila bisa, skill bila mampu, basic bila tidak.
// Mempertimbangkan skill2 (unlock ★5): pilih yang terjangkau, selang-seling deterministik.
// Menyertakan target eksplisit (aktif lawan / teman terlemah) agar valid di aturan tap-to-target.
export function aiChoose(battle, side = 'enemy') {
  const me = battle[side];
  const foe = battle[side === 'player' ? 'enemy' : 'player'];
  const actor = me.fighters[me.active];
  const foeActive = foe.fighters[foe.active];
  const target = foe.active;
  const canS1 = me.cons >= actor.cons;
  const hasS2 = Boolean(actor.skill2Name) && (actor.skill2 || 0) > 0 && isSkill2Unlocked(actor);
  const canS2 = hasS2 && me.cons >= (actor.cons2 ?? 99);
  if (actor.role === 'Support') {
    const healTo = healTarget(me);
    const ally = healTo ? me.fighters.indexOf(healTo) : me.active;
    if (healTo && healTo.hp / healTo.maxHp < 0.6 && (canS1 || canS2)) {
      if (canS2 && (!canS1 || (actor.cons2 ?? 99) <= actor.cons)) return { type: 'skill2', ally };
      return { type: 'skill', ally };
    }
  } else if ((canS1 && (foeActive.hp <= actor.skill || me.cons >= MAX_CONS - 1)) ||
             (canS2 && (foeActive.hp <= actor.skill2 || me.cons >= MAX_CONS - 1))) {
    const s1Kills = canS1 && foeActive.hp <= actor.skill;
    const s2Kills = canS2 && foeActive.hp <= actor.skill2;
    if (s1Kills && s2Kills) return { type: actor.skill2 >= actor.skill ? 'skill2' : 'skill', target };
    if (s2Kills) return { type: 'skill2', target };
    if (s1Kills) return { type: 'skill', target };
    if (canS1 && canS2) return { type: battle.turnCount % 2 === 0 ? 'skill2' : 'skill', target };
    return { type: canS1 ? 'skill' : 'skill2', target };
  }
  if (foeActive.hp <= actor.basic) return { type: 'basic', target };
  if (actor.role !== 'Support' && (canS1 || canS2)) {
    if (canS1 && canS2) return { type: battle.turnCount % 2 === 0 ? 'skill2' : 'skill', target };
    return { type: canS1 ? 'skill' : 'skill2', target };
  }
  return { type: 'basic', target };
}

// Simulasi penuh sampai selesai (giliran bergantian mulai dari first). Return battle + log.
export function simulate(playerStats, enemyStats, first = 'player', rng = Math.random) {
  const battle = createBattle(playerStats, enemyStats, first);
  const order = first === 'player' ? ['player', 'enemy'] : ['enemy', 'player'];
  let i = 0;
  while (!battle.over && i < MAX_TURNS * 2) {
    const acting = order[i % 2];
    act(battle, acting, aiChoose(battle, acting), rng);
    i += 1;
  }
  if (!battle.over) {
    // Batas giliran: HP total tertinggi menang.
    const p = teamAliveHp(battle.player) / teamMaxHp(battle.player);
    const e = teamAliveHp(battle.enemy) / teamMaxHp(battle.enemy);
    battle.over = true;
    battle.winner = p >= e ? 'you' : 'ai';
    battle.log.push({ t: battle.turnCount, type: 'end', winner: battle.winner, timeout: true });
  }
  return battle;
}
