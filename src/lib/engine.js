// Engine battle kartu: 3v3 bergiliran, cons tim, role Damage/Tank/Support/Assist.
// Skill punya efek khusus per kartu + status (burn/regen/shield/stun/weaken/focus)
// + kombo chain (skill beruntun +25%). Murni (tanpa I/O).

export const MAX_CONS = 10;
export const MAX_TURNS = 30;

export function makeFighter(stat) {
  return {
    name: stat.name,
    role: stat.role,
    maxHp: stat.hp,
    hp: stat.hp,
    basic: stat.basic,
    skillName: stat.skillName,
    skill: stat.skill,
    cons: stat.cons,
    effect: stat.effect || 'none',
    effectVal: stat.effectVal ?? 0,
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
  const foeActive = foe.fighters[foe.active];
  const combo = me.lastWasSkill;

  if (action?.type === 'skill') {
    if (me.cons < actor.cons) return false;
    me.cons -= actor.cons;
    me.lastWasSkill = true;
    const comboMult = combo ? 1.25 : 1;
    const focusMult = actor.focus ? 1.4 : 1;
    actor.focus = false;
    const fx = actor.effect;
    const val = actor.effectVal;
    const base = actor.skill * variance(rng);

    // --- Support: heal ---
    if (actor.role === 'Support') {
      const target = healTarget(me);
      if (!target) {
        me.cons = Math.min(MAX_CONS, me.cons + actor.cons); // batal: kembalikan
        me.lastWasSkill = false;
        return false;
      } else if (fx === 'regen') {
        const amount = Math.round(actor.skill * 0.22 * comboMult);
        target.regen = { amount, turns: 3 };
        battle.log.push({
          t: battle.turnCount, type: 'regen', side, name: actor.name,
          skill: actor.skillName, target: target.name, amount, turns: 3,
          cons: me.cons, combo, effect: fx,
        });
        return true;
      } else {
        const mult = fx === 'energize' ? 0.45 : 0.7;
        const amount = Math.min(target.maxHp - target.hp, Math.round(base * mult * comboMult));
        target.hp += amount;
        if (fx === 'energize') me.cons = Math.min(MAX_CONS, me.cons + 2);
        battle.log.push({
          t: battle.turnCount, type: 'heal', side, name: actor.name,
          skill: actor.skillName, target: target.name, amount, cons: me.cons,
          combo, effect: fx,
        });
        return true;
      }
    } else {
      // --- Damage/Tank/Assist: serang dengan efek ---
      let dmg = base * atkMult * comboMult * focusMult;
      const ev = {
        t: battle.turnCount, type: 'skill', side, name: actor.name,
        skill: actor.skillName, target: foeActive.name, cons: me.cons,
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
        const { dealt, absorbed } = dealDamage(foeActive, h);
        totalDealt += dealt;
        totalAbsorbed += absorbed;
        if (foeActive.hp <= 0) break;
      }
      ev.dmg = totalDealt;
      ev.absorbed = totalAbsorbed;

      // Efek sekunder.
      if (fx === 'burn') {
        foeActive.burn = { dmg: Math.round(actor.skill * (val / 100)), turns: 2 };
        ev.status = 'burn';
      } else if (fx === 'shield') {
        actor.shield += Math.round(actor.skill * (val / 100));
        ev.status = 'shield';
      } else if (fx === 'bulwark') {
        actor.shield += Math.round(actor.skill * (val / 100));
        ev.status = 'shield';
      } else if (fx === 'slam' && rng() * 100 < val) {
        foeActive.stun = true;
        ev.status = 'stun';
      } else if (fx === 'surge') {
        me.cons = Math.min(MAX_CONS, me.cons + 2);
        ev.status = 'surge';
      } else if (fx === 'weaken') {
        foeActive.weaken = 2;
        ev.status = 'weaken';
      } else if (fx === 'focus') {
        actor.focus = true;
        ev.status = 'focus';
      }
      battle.log.push(ev);
      if (foeActive.hp <= 0) markKo(battle, side === 'player' ? 'enemy' : 'player', foeActive);
      return true;
    }
  }

  // Default: ATK biasa (+1 cons).
  const { dealt, absorbed } = dealDamage(foeActive, actor.basic * variance(rng) * atkMult);
  me.cons = Math.min(MAX_CONS, me.cons + 1);
  me.lastWasSkill = false;
  battle.log.push({
    t: battle.turnCount, type: 'basic', side, name: actor.name,
    target: foeActive.name, dmg: dealt, absorbed, cons: me.cons,
  });
  if (foeActive.hp <= 0) markKo(battle, side === 'player' ? 'enemy' : 'player', foeActive);
  return true;
}

// Heuristik AI: bunuh bila bisa, skill bila mampu, basic bila tidak.
export function aiChoose(battle, side = 'enemy') {
  const me = battle[side];
  const foe = battle[side === 'player' ? 'enemy' : 'player'];
  const actor = me.fighters[me.active];
  const foeActive = foe.fighters[foe.active];
  if (actor.role === 'Support') {
    const target = healTarget(me);
    if (target && target.hp / target.maxHp < 0.6 && me.cons >= actor.cons) {
      return { type: 'skill' };
    }
  } else if (me.cons >= actor.cons && (foeActive.hp <= actor.skill || me.cons >= MAX_CONS - 1)) {
    return { type: 'skill' };
  }
  if (foeActive.hp <= actor.basic) return { type: 'basic' };
  if (actor.role !== 'Support' && me.cons >= actor.cons) return { type: 'skill' };
  return { type: 'basic' };
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
