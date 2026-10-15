import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { executeBundleTrade, executeTrade } from '../../src/lib/trade.js';

// Mock DB in-memory: hanya pola SQL yang dipakai trade (+ diam untuk lain).
function mockDb(seed = []) {
  const cards = new Map(); // `${userId}|${lower}` -> row
  for (const c of seed) cards.set(`${c.userId}|${String(c.char_name || c.charName).toLowerCase()}`, { ...c });
  return {
    cards,
    async execute({ sql, args }) {
      const q = String(sql);
      if (q.startsWith('SELECT') && q.includes('FROM user_cards') && q.includes('LOWER(char_name)')) {
        const row = cards.get(`${String(args[0])}|${String(args[1]).toLowerCase()}`);
        return { rows: row ? [row] : [] };
      }
      if (q.startsWith('UPDATE user_cards SET quantity = quantity -')) {
        const row = cards.get(`${String(args[1])}|${String(args[2]).toLowerCase()}`);
        if (row) row.quantity -= Number(args[0]);
        return { rows: [] };
      }
      if (q.startsWith('UPDATE user_cards SET quantity = quantity +')) {
        const row = cards.get(`${String(args[2])}|${String(args[3]).toLowerCase()}`);
        if (row) row.quantity += Number(args[0]);
        return { rows: [] };
      }
      if (q.startsWith('DELETE FROM user_cards')) {
        cards.delete(`${String(args[0])}|${String(args[1]).toLowerCase()}`);
        return { rows: [] };
      }
      if (q.startsWith('INSERT INTO user_cards')) {
        cards.set(`${String(args[0])}|${String(args[2]).toLowerCase()}`, {
          userId: String(args[0]), char_name: String(args[2]), anime: String(args[3]),
          rarity: String(args[4]), level: 1, power: Number(args[5]) || 0,
          image_url: args[6] || null, is_showcase: 0, quantity: Number(args[7]),
        });
        return { rows: [] };
      }
      return { rows: [] }; // trade_offers/items DELETE + missions: diam
    },
  };
}

const C = (userId, charName, rarity, quantity) => ({
  userId, char_name: charName, anime: 'A', rarity, level: 1, power: 10,
  image_url: null, is_showcase: 0, quantity,
});

describe('executeBundleTrade (mock DB)', () => {
  let db;
  beforeEach(() => {
    db = mockDb([
      C('owner', 'R1', 'Rare', 1),
      C('owner', 'R2', 'Rare', 2),
      C('taker', 'E1', 'Epic', 1),
      C('taker', 'C1', 'Common', 11),
    ]);
  });

  it('2 Rare untuk 1 Epic berhasil + kartu pindah', async () => {
    const offer = { code: '111111', ownerId: 'owner', ownerUsername: 'o', items: [
      { charName: 'R1', rarity: 'Rare', amount: 1 },
      { charName: 'R2', rarity: 'Rare', amount: 1 },
    ] };
    const res = await executeBundleTrade(db, offer, 'taker', 't', [{ charName: 'E1', amount: 1 }]);
    assert.equal(res.ok, true);
    assert.equal(res.received.length, 2);
    assert.equal(res.given.length, 1);
    assert.equal(db.cards.get('taker|r1').quantity, 1);
    assert.equal(db.cards.get('taker|r2').quantity, 1);
    assert.equal(db.cards.get('owner|e1').quantity, 1);
    assert.equal(db.cards.has('owner|r1'), false); // habis -> baris dihapus
    assert.equal(db.cards.get('owner|r2').quantity, 1); // sisa 1 dari 2
  });

  it('1 Rare vs 1 Epic ditolak (2 vs 4)', async () => {
    const offer = { code: '1', ownerId: 'owner', ownerUsername: 'o', items: [{ charName: 'R1', rarity: 'Rare', amount: 1 }] };
    const res = await executeBundleTrade(db, offer, 'taker', 't', [{ charName: 'E1', amount: 1 }]);
    assert.equal(res.ok, false);
    assert.match(res.message, /2 vs 4/);
  });

  it('kartu sama di kedua sisi ditolak', async () => {
    db.cards.set('taker|r1', C('taker', 'R1', 'Rare', 1));
    const offer = { code: '1', ownerId: 'owner', ownerUsername: 'o', items: [{ charName: 'R1', rarity: 'Rare', amount: 1 }] };
    const res = await executeBundleTrade(db, offer, 'taker', 't', [{ charName: 'R1', amount: 1 }]);
    assert.equal(res.ok, false);
  });

  it('tukar dengan diri sendiri ditolak', async () => {
    const offer = { code: '1', ownerId: 'owner', ownerUsername: 'o', items: [{ charName: 'R1', rarity: 'Rare', amount: 1 }] };
    const res = await executeBundleTrade(db, offer, 'owner', 'o', [{ charName: 'R2', amount: 1 }]);
    assert.equal(res.ok, false);
  });

  it('wrapper legacy 1-vs-1 tier sama: bentuk objek lama', async () => {
    db.cards.set('taker|r9', C('taker', 'R9', 'Rare', 1));
    const offer = { code: '1', ownerId: 'owner', ownerUsername: 'o', charName: 'R1', rarity: 'Rare', amount: 1 };
    const res = await executeTrade(db, offer, 'taker', 't', 'R9', 1);
    assert.equal(res.ok, true);
    assert.equal(res.received.charName, 'R1');
    assert.equal(res.given.charName, 'R9');
  });
});
