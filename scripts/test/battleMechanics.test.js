import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WAIFU_POOL } from '../../src/data/waifuPool.js';
import { CARD_BATTLE_SKILLS } from '../../src/data/cardBattleSkills.js';
import { genCardStats, resolveRole, ROLES } from '../../src/lib/battleStats.js';
import { createBattle, act } from '../../src/lib/engine.js';
import { effectDescription, skillDetail } from '../../src/lib/skillInfo.js';

// RNG tetap: variance() = 1.0, lalu nilai berikutnya dipakai untuk peluang efek.
function rngSeq(...vals) {
  let i = 0;
  return () => vals[Math.min(i++, vals.length - 1)];
}

function fighter(overrides = {}) {
  return {
    name: 'Tester',
    tier: 'Epic',
    role: 'Damage',
    level: 1,
    hp: 1000,
    basic: 10,
    skillName: 'Skill Satu',
    skill: 100,
    cons: 6,
    effect: 'none',
    effectVal: 0,
    skill2Name: null,
    skill2: 0,
    cons2: 0,
    effect2: 'none',
    effectVal2: 0,
    ...overrides,
  };
}

function battleWith(player, enemy, first = 'player') {
  const battle = createBattle(player, enemy, first);
  battle.player.cons = 20;
  battle.enemy.cons = 20;
  return battle;
}

describe('role baru + skill khusus', () => {
  it('41 kartu baru punya role valid dan nama skill kurasi', () => {
    const keys = Object.keys(CARD_BATTLE_SKILLS);
    assert.equal(keys.length, 41);
    for (const key of keys) {
      const entry = WAIFU_POOL.find((e) => e.name.toLowerCase() === key);
      assert.ok(entry, `kartu ${key} tidak ada di pool`);
      assert.ok(ROLES.includes(resolveRole(entry)), `role ${key} invalid`);
      const s = genCardStats(entry);
      assert.equal(s.skillName, CARD_BATTLE_SKILLS[key].skill1.name);
      assert.equal(s.effect, CARD_BATTLE_SKILLS[key].skill1.effect);
      assert.equal(s.skill2Name, CARD_BATTLE_SKILLS[key].skill2.name);
      assert.equal(s.effect2, CARD_BATTLE_SKILLS[key].skill2.effect);
    }
  });

  it('distribusi role 306 kartu sesuai roster', () => {
    const count = {};
    for (const entry of WAIFU_POOL) {
      const role = resolveRole(entry);
      count[role] = (count[role] || 0) + 1;
    }
    assert.deepEqual(count, {
      Damage: 107,
      Tank: 77,
      Healer: 63,
      Support: 37,
      Assassin: 12,
      Mage: 10,
    });
  });
});

describe('mekanik Execute', () => {
  it('bonus +60% hanya saat HP target <=35%', () => {
    const normal = battleWith(
      [fighter({ skill: 50, effect: 'execute', effectVal: 60 })],
      [fighter({ name: 'Target', hp: 1000 })],
      'player',
    );
    act(normal, 'player', { type: 'skill', target: 0 }, () => 0.5);
    const normalEvent = normal.log.find((e) => e.type === 'skill');
    assert.equal(normalEvent.dmg, 50);
    assert.equal(normalEvent.execute, undefined);

    const low = battleWith(
      [fighter({ skill: 50, effect: 'execute', effectVal: 60 })],
      [fighter({ name: 'Target', hp: 100 })],
      'player',
    );
    low.enemy.fighters[0].hp = 30;
    act(low, 'player', { type: 'skill', target: 0 }, () => 0.5);
    const lowEvent = low.log.find((e) => e.type === 'skill');
    assert.equal(lowEvent.dmg, 80);
    assert.equal(lowEvent.execute, true);
    assert.equal(lowEvent.status, 'execute');
  });
});

describe('mekanik Arcane Splash', () => {
  it('damage utama penuh + 25% ke semua cadangan, shield ikut menghisap', () => {
    const battle = battleWith(
      [fighter({ skill: 100, effect: 'splash', effectVal: 25 })],
      [
        fighter({ name: 'Aktif', hp: 1000 }),
        fighter({ name: 'Cadangan 1', hp: 1000 }),
        fighter({ name: 'Cadangan 2', hp: 1000 }),
      ],
      'player',
    );
    battle.enemy.fighters[1].shield = 10;
    act(battle, 'player', { type: 'skill', target: 0 }, () => 0.5);

    assert.equal(battle.enemy.fighters[0].hp, 900);
    assert.equal(battle.enemy.fighters[1].hp, 985);
    assert.equal(battle.enemy.fighters[1].shield, 0);
    assert.equal(battle.enemy.fighters[2].hp, 975);

    const ev = battle.log.find((e) => e.type === 'skill');
    assert.equal(ev.dmg, 100);
    assert.equal(ev.status, 'splash');
    assert.deepEqual(ev.splash, [
      { name: 'Cadangan 1', dmg: 15, absorbed: 10 },
      { name: 'Cadangan 2', dmg: 25, absorbed: 0 },
    ]);
  });
});

describe('mekanik Silence', () => {
  it('mengunci skill 1 giliran; basic tetap boleh', () => {
    const battle = battleWith(
      [fighter({ skill: 50, effect: 'silence', effectVal: 50 })],
      [fighter({ name: 'Target', basic: 10 })],
      'player',
    );
    act(battle, 'player', { type: 'skill', target: 0 }, rngSeq(0.5, 0.1));
    assert.equal(battle.enemy.fighters[0].silenced, 2);

    const blocked = act(battle, 'enemy', { type: 'skill', target: 0 }, () => 0.5);
    assert.equal(blocked, false);

    const basic = act(battle, 'enemy', { type: 'basic', target: 0 }, () => 0.5);
    assert.equal(basic, true);
    assert.equal(battle.enemy.fighters[0].silenced, 0);

    act(battle, 'player', { type: 'basic', target: 0 }, () => 0.5);
    const allowed = act(battle, 'enemy', { type: 'skill', target: 0 }, () => 0.5);
    assert.equal(allowed, true);
  });

  it('peluang gagal tidak memasang silence', () => {
    const battle = battleWith(
      [fighter({ skill: 50, effect: 'silence', effectVal: 50 })],
      [fighter({ name: 'Target' })],
      'player',
    );
    act(battle, 'player', { type: 'skill', target: 0 }, rngSeq(0.5, 0.9));
    assert.equal(battle.enemy.fighters[0].silenced, 0);
  });
});

describe('kompatibilitas role lama', () => {
  it('pasif assist hanya untuk Support baru/Assist lama, bukan healer Support lama', () => {
    const oldHealer = fighter({ name: 'Old Healer', role: 'Support', effect: 'heal' });
    const oldAssist = fighter({ name: 'Old Assist', role: 'Assist', effect: 'surge' });
    const newSupport = fighter({ name: 'New Support', role: 'Support', effect: 'weaken' });
    const healer = fighter({ name: 'New Healer', role: 'Healer', effect: 'heal' });

    const battle = battleWith([oldHealer, oldAssist, newSupport], [fighter(), fighter(), fighter()], 'player');
    assert.equal(battle.player.assistBonus, 2);

    const healersOnly = createBattle([oldHealer, healer, oldHealer], [fighter(), fighter(), fighter()], 'player');
    assert.equal(healersOnly.player.assistBonus, 0);
  });

  it('cabang heal mengikuti efek, bukan label role', () => {
    const disguisedHealer = fighter({
      name: 'Disguised Healer',
      role: 'Damage',
      effect: 'heal',
      effectVal: 70,
      skill: 100,
    });
    const friend = fighter({ name: 'Friend', hp: 1000 });
    const battle = battleWith([disguisedHealer, friend], [fighter()], 'player');
    battle.player.fighters[1].hp = 500;

    const ok = act(battle, 'player', { type: 'skill', ally: 1, target: 0 }, () => 0.5);
    assert.equal(ok, true);
    assert.equal(battle.player.fighters[1].hp, 570);
    assert.equal(battle.enemy.fighters[0].hp, 1000);
    assert.equal(battle.log.find((e) => e.type === 'heal').effect, 'heal');
  });

  it('room lama tanpa field skill2/silenced tetap bisa basic', () => {
    const battle = battleWith([fighter(), fighter(), fighter()], [fighter(), fighter(), fighter()], 'player');
    for (const f of [...battle.player.fighters, ...battle.enemy.fighters]) {
      delete f.skill2Name;
      delete f.silenced;
    }
    const ok = act(battle, 'player', { type: 'basic', target: 0 }, () => 0.5);
    assert.equal(ok, true);
    assert.ok(battle.enemy.fighters[0].hp < battle.enemy.fighters[0].maxHp);
  });
});

describe('info skill UI', () => {
  it('deskripsi efek baru lengkap', () => {
    assert.match(effectDescription('execute', 60), /35%/);
    assert.match(effectDescription('execute', 60), /60%/);
    assert.match(effectDescription('splash', 25), /cadangan/);
    assert.match(effectDescription('silence', 50), /skill/);
  });

  it('skillDetail mengambil nama dan cons dari slot yang benar', () => {
    const f = fighter({
      skillName: 'Satu',
      skill2Name: 'Dua',
      cons2: 8,
      effect2: 'splash',
      effectVal2: 25,
    });
    const d = skillDetail(f, 2);
    assert.equal(d.name, 'Dua');
    assert.equal(d.cons, 8);
    assert.equal(d.label, 'Splash');
    assert.equal(d.slot, 2);
  });
});
