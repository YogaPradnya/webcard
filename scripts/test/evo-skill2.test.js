import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { genCardStats, genSecondSkill } from '../../src/lib/battleStats.js';
import { EVO_COST, checkEvoCost, isEvoBlockedRarity, MAX_CARD_LEVEL } from '../../src/lib/evolve.js';
import { createBattle, act, aiChoose, makeFighter, simulate } from '../../src/lib/engine.js';

describe('evo cost 3/3/3/5', () => {
  it('tabel biaya sesuai spek', () => {
    assert.deepEqual(EVO_COST, {
      1: { need: 3, consume: 2 },
      2: { need: 3, consume: 2 },
      3: { need: 3, consume: 2 },
      4: { need: 5, consume: 4 },
    });
    assert.equal(MAX_CARD_LEVEL, 5);
  });
  it('checkEvoCost: cukup vs kurang vs mentok', () => {
    assert.deepEqual(checkEvoCost(1, 3), { ok: true, need: 3, consume: 2 });
    assert.deepEqual(checkEvoCost(4, 5), { ok: true, need: 5, consume: 4 });
    assert.equal(checkEvoCost(1, 2).ok, false);
    assert.equal(checkEvoCost(4, 4).ok, false);
    assert.equal(checkEvoCost(5, 999).ok, false);
    assert.equal(checkEvoCost(9, 9).ok, false);
  });
  it('Legend/Mythic diblokir, tier lain boleh', () => {
    assert.equal(isEvoBlockedRarity('Legendary'), true);
    assert.equal(isEvoBlockedRarity('Mythic'), true);
    assert.equal(isEvoBlockedRarity('Epic'), false);
    assert.equal(isEvoBlockedRarity('Rare'), false);
    assert.equal(isEvoBlockedRarity('Common'), false);
  });
});

describe('skill kedua (unlock ★5)', () => {
  it('genSecondSkill deterministik + efek beda dari skill1', () => {
    const a = genSecondSkill({ name: 'Naruto Uzumaki', tier: 'Epic' }, 'Damage', 'heavy');
    const b = genSecondSkill({ name: 'Naruto Uzumaki', tier: 'Epic' }, 'Damage', 'heavy');
    assert.deepEqual(a, b);
    assert.ok(a.skill2Name && a.skill2Name !== '');
    assert.ok(a.skill2 > 0 && a.cons2 > 0);
    assert.notEqual(a.effect2, 'heavy');
  });
  it('genCardStats membawa skill2', () => {
    const s = genCardStats({ name: 'Gojo Satoru', tier: 'Legendary' });
    assert.ok(s.skill2Name && s.skill2 > 0 && s.cons2 > 0);
    assert.notEqual(s.effect2, s.effect);
  });
  it('makeFighter membawa skill2, null bila tidak ada (room lama)', () => {
    const s = genCardStats({ name: 'A', tier: 'Common' });
    const f = makeFighter(s);
    assert.equal(f.skill2Name, s.skill2Name);
    const legacy = makeFighter({ name: 'B', role: 'Damage', hp: 50, basic: 10, skillName: 'X', skill: 20, cons: 3 });
    assert.equal(legacy.skill2Name, null);
  });
});

describe('engine skill2', () => {
  function dmgStat(name, overrides = {}) {
    return {
      name, role: 'Damage', hp: 200, basic: 10,
      skillName: 'S1', skill: 40, cons: 2, effect: 'none', effectVal: 0,
      skill2Name: 'S2', skill2: 60, cons2: 3, effect2: 'none', effectVal2: 0,
      ...overrides,
    };
  }
  it('skill2 memakai cons2 + damage skill2, log bawa slot:2', () => {
    const b = createBattle([dmgStat('A'), dmgStat('B'), dmgStat('C')], [dmgStat('X'), dmgStat('Y'), dmgStat('Z')]);
    b.player.cons = 10;
    const hpBefore = b.enemy.fighters[0].hp;
    const ok = act(b, 'player', { type: 'skill2' }, () => 0.5);
    assert.equal(ok, true);
    assert.equal(b.player.cons, 7);
    assert.ok(b.enemy.fighters[0].hp < hpBefore);
    const ev = b.log[b.log.length - 1];
    assert.equal(ev.type, 'skill');
    assert.equal(ev.slot, 2);
    assert.equal(ev.skill, 'S2');
  });
  it('skill2 terkunci tanpa skill2Name / cons kurang', () => {
    const b = createBattle([dmgStat('A', { skill2Name: null })], [dmgStat('X')]);
    b.player.cons = 10;
    assert.equal(act(b, 'player', { type: 'skill2' }, () => 0.5), false);
    const b2 = createBattle([dmgStat('A')], [dmgStat('X')]);
    b2.player.cons = 0;
    assert.equal(act(b2, 'player', { type: 'skill2' }, () => 0.5), false);
  });
  it('aiChoose bisa memilih skill2 bila skill1 tak terjangkau', () => {
    const b = createBattle([dmgStat('A', { cons: 9, cons2: 2 })], [dmgStat('X')]);
    b.player.cons = 2;
    const pick = aiChoose(b, 'player');
    assert.equal(pick.type, 'skill2');
  });
  it('simulate selesai dengan fighter skill2', () => {
    const b = simulate([dmgStat('A'), dmgStat('B'), dmgStat('C')], [dmgStat('X'), dmgStat('Y'), dmgStat('Z')], 'player', () => 0.5);
    assert.equal(b.over, true);
    assert.ok(['you', 'ai'].includes(b.winner));
  });
});
