import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  trimBattleLog, MAX_BATTLE_LOG, touchRoomCache, getRoomCached,
} from '../../src/lib/rooms.js';

describe('cache baca room + cap log', () => {
  it('trimBattleLog memotong ekor 300, diam bila pendek', () => {
    const long = { log: Array.from({ length: 350 }, (_, i) => ({ t: i })) };
    trimBattleLog(long);
    assert.equal(long.log.length, MAX_BATTLE_LOG);
    assert.equal(long.log[0].t, 50);
    assert.equal(long.log[MAX_BATTLE_LOG - 1].t, 349);
    const short = { log: [{ t: 1 }] };
    trimBattleLog(short);
    assert.equal(short.log.length, 1);
    assert.equal(trimBattleLog(null), null);
  });
  it('getRoomCached hit tanpa DB + hasil klon', async () => {
    const room = { code: '999001', battle: { log: [{ t: 1 }] }, turn: 'u1' };
    touchRoomCache(room);
    const a = await getRoomCached('999001', 60000);
    assert.equal(a.code, '999001');
    assert.notEqual(a, room);
    a.battle.log.push({ t: 2 });
    const b = await getRoomCached('999001', 60000);
    assert.equal(b.battle.log.length, 1);
  });
});
