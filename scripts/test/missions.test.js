import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DAILY_MISSIONS, WEEKLY_MISSIONS, jakartaWeekKey } from '../../src/lib/missions.js';

describe('misi', () => {
  it('definisi valid: id unik, target & xp positif', () => {
    for (const list of [DAILY_MISSIONS, WEEKLY_MISSIONS]) {
      const ids = list.map((m) => m.id);
      assert.equal(new Set(ids).size, ids.length, 'id duplikat');
      for (const m of list) {
        assert.ok(m.target > 0 && m.xp > 0, m.id);
        assert.ok(m.label && m.event, m.id);
      }
    }
  });
  it('misi user sesuai spek', () => {
    const d = Object.fromEntries(DAILY_MISSIONS.map((m) => [m.id, m]));
    assert.equal(d.gacha_1.target, 1);
    assert.equal(d.pvp_1.target, 1);
    assert.equal(d.pvp_5.target, 5);
    assert.ok(!DAILY_MISSIONS.some((m) => m.event === 'battle'), 'harian tanpa AI');
    const w = Object.fromEntries(WEEKLY_MISSIONS.map((m) => [m.id, m]));
    assert.equal(w.gacha_15.target, 15);
    assert.equal(w.battle_15.target, 15);
    assert.equal(w.pvp_25.target, 25);
  });
  it('weekKey = Senin minggu berjalan', () => {
    // 2026-10-13 Selasa -> Senin 2026-10-12; 2026-10-18 Minggu -> Senin 2026-10-12; 2026-10-19 Senin -> dirinya
    assert.equal(jakartaWeekKey(new Date('2026-10-13T12:00:00+07:00')), '2026-10-12');
    assert.equal(jakartaWeekKey(new Date('2026-10-18T12:00:00+07:00')), '2026-10-12');
    assert.equal(jakartaWeekKey(new Date('2026-10-19T00:01:00+07:00')), '2026-10-19');
  });
});
