import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  bumpRoom,
  roomVersion,
  addRoomListener,
  removeRoomListener,
  touchPresence,
  onlineIds,
  getRematchOffer,
  clearRematchOffer,
} from '../../src/lib/roomEvents.js';
import { sideTeamNames, publicState } from '../../src/lib/rooms.js';

function fakeRoom(over = {}) {
  return {
    code: '123456',
    mode: 'pvp',
    p1Id: 'u1',
    p1Username: 'A',
    p2Id: 'u2',
    p2Username: 'B',
    p1Team: [],
    battle: {
      player: { fighters: [{ name: 'A1' }, { name: 'A2' }, { name: 'A3' }] },
      enemy: { fighters: [{ name: 'B1' }, { name: 'B2' }, { name: 'B3' }] },
      over: false,
      turnCount: 3,
      log: [],
    },
    turn: 'u1',
    status: 'ongoing',
    winner: null,
    result: null,
    xpPaid: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...over,
  };
}

describe('roomEvents bus', () => {
  it('bump menaikkan versi + memberi tahu listener', () => {
    const code = '990001';
    const v0 = roomVersion(code);
    let got = 0;
    const fn = () => { got += 1; };
    addRoomListener(code, fn);
    bumpRoom(code);
    bumpRoom(code);
    assert.equal(roomVersion(code), v0 + 2);
    assert.equal(got, 2);
    removeRoomListener(code, fn);
    bumpRoom(code);
    assert.equal(got, 2);
  });
  it('presence: online dalam TTL, hilang setelah kadaluarsa', () => {
    const code = '990002';
    touchPresence(code, 'u1');
    assert.deepEqual(onlineIds(code, Date.now()), ['u1']);
    assert.deepEqual(onlineIds(code, Date.now() + 60 * 1000), []);
  });
  it('rematch offer tersimpan + bisa dibersihkan', () => {
    const code = '990003';
    assert.equal(getRematchOffer(code), null);
    bumpRoom(code, { rematch: { code: '111', from: 'A' } });
    assert.deepEqual(getRematchOffer(code), { code: '111', from: 'A' });
    clearRematchOffer(code);
    assert.equal(getRematchOffer(code), null);
  });
});

describe('rooms realtime helpers', () => {
  it('sideTeamNames ambil 3 nama tiap sisi', () => {
    const room = fakeRoom();
    assert.deepEqual(sideTeamNames(room, 'u1'), ['A1', 'A2', 'A3']);
    assert.deepEqual(sideTeamNames(room, 'u2'), ['B1', 'B2', 'B3']);
    assert.deepEqual(sideTeamNames(room, 'u9'), []);
  });
  it('sideTeamNames tolak tim tak lengkap/duplikat', () => {
    const room = fakeRoom({
      battle: { player: { fighters: [{ name: 'A1' }, { name: 'A1' }] }, enemy: { fighters: [] } },
    });
    assert.deepEqual(sideTeamNames(room, 'u1'), []);
  });
  it('publicState petakan sisi + forfeit', () => {
    const room = fakeRoom();
    const ps = publicState(room, 'u2');
    assert.equal(ps.yourSide, 'enemy');
    assert.equal(ps.code, '123456');
    assert.ok(typeof ps.forfeitMsLeft === 'number');
    const ps2 = publicState(room, 'u1');
    assert.equal(ps2.yourSide, 'player');
  });
});
