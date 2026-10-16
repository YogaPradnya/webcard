import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { executeBundleTrade } from '../../src/lib/trade.js';

// Mock dengan dukungan transaction() copy-on-write.
// Tanpa transaction (legacy): tulis langsung ke base (bisa partial).
// Dengan transaction: tulis ke snapshot, commit ganti base, rollback buang.
function txMockDb(seed = [], opts = {}) {
  const base = new Map();
  for (const c of seed) base.set(`${c.userId}|${String(c.char_name || c.charName).toLowerCase()}`, { ...c });

  function runOn(store, { sql, args }) {
    const q = String(sql);
    if (q.startsWith('SELECT') && q.includes('FROM user_cards') && q.includes('LOWER(char_name)')) {
      const row = store.get(`${String(args[0])}|${String(args[1]).toLowerCase()}`);
      return { rows: row ? [{ ...row }] : [] };
    }
    if (q.startsWith('UPDATE user_cards SET quantity = quantity -')) {
      const row = store.get(`${String(args[1])}|${String(args[2]).toLowerCase()}`);
      if (row) row.quantity -= Number(args[0]);
      return { rows: [], rowsAffected: row ? 1 : 0 };
    }
    if (q.startsWith('UPDATE user_cards SET quantity = quantity +')) {
      if (opts.failGrant) throw new Error('INJECTED_GRANT_FAIL');
      const row = store.get(`${String(args[2])}|${String(args[3]).toLowerCase()}`);
      if (row) row.quantity += Number(args[0]);
      return { rows: [], rowsAffected: row ? 1 : 0 };
    }
    if (q.startsWith('DELETE FROM user_cards')) {
      store.delete(`${String(args[0])}|${String(args[1]).toLowerCase()}`);
      return { rows: [] };
    }
    if (q.startsWith('INSERT INTO user_cards')) {
      if (opts.failGrant) throw new Error('INJECTED_GRANT_FAIL');
      store.set(`${String(args[0])}|${String(args[2]).toLowerCase()}`, {
        userId: String(args[0]), char_name: String(args[2]), anime: String(args[3]),
        rarity: String(args[4]), level: 1, power: Number(args[5]) || 0,
        image_url: args[6] || null, is_showcase: 0, quantity: Number(args[7]),
      });
      return { rows: [] };
    }
    return { rows: [] };
  }

  const db = {
    cards: base,
    async execute(stmt) { return runOn(base, stmt); },
  };
  if (!opts.noTx) {
    db.transaction = async () => {
      const snap = new Map([...base].map(([k, v]) => [k, { ...v }]));
      let done = false;
      return {
        async execute(stmt) {
          if (done) throw new Error('TX_CLOSED');
          return runOn(snap, stmt);
        },
        async commit() {
          if (done) throw new Error('TX_CLOSED');
          done = true;
          base.clear();
          for (const [k, v] of snap) base.set(k, v);
        },
        async rollback() { done = true; },
        close() { done = true; },
        get closed() { return done; },
      };
    };
  }
  return db;
}

const C = (userId, charName, rarity, quantity) => ({
  userId, char_name: charName, anime: 'A', rarity, level: 1, power: 10,
  image_url: null, is_showcase: 0, quantity,
});

const offerOf = (items) => ({
  code: '111111', ownerId: 'owner', ownerUsername: 'ow',
  items, charName: items[0].charName, rarity: items[0].rarity, amount: items[0].amount,
});

describe('trade atomik (transaksi)', () => {
  it('grant gagal di tengah -> TIDAK ada kartu yang hilang/berpindah (all-or-nothing)', async () => {
    const db = txMockDb([
      C('owner', 'R1', 'Rare', 2),
      C('taker', 'E1', 'Epic', 1),
    ], { failGrant: true });
    const offer = offerOf([{ charName: 'R1', rarity: 'Rare', amount: 2 }]);
    const res = await executeBundleTrade(db, offer, 'taker', 'tk', [{ charName: 'E1', amount: 1 }]);
    assert.equal(res.ok, false);
    // owner tetap 2 (tidak berkurang), taker tetap 1 (tidak bertambah)
    const g = (u, n) => db.cards.get(`${u}|${n.toLowerCase()}`)?.quantity;
    assert.equal(g('owner', 'R1'), 2);
    assert.equal(g('taker', 'E1'), 1);
    assert.equal(g('taker', 'R1'), undefined);
  });

  it('sukses tetap pindah seperti biasa (via tx)', async () => {
    const db = txMockDb([
      C('owner', 'R1', 'Rare', 1),
      C('owner', 'R2', 'Rare', 1),
      C('taker', 'E1', 'Epic', 1),
    ]);
    const offer = offerOf([
      { charName: 'R1', rarity: 'Rare', amount: 1 },
      { charName: 'R2', rarity: 'Rare', amount: 1 },
    ]);
    const res = await executeBundleTrade(db, offer, 'taker', 'tk', [{ charName: 'E1', amount: 1 }]);
    assert.equal(res.ok, true);
    const g = (u, n) => db.cards.get(`${u}|${n.toLowerCase()}`)?.quantity;
    assert.equal(g('owner', 'R1'), undefined);
    assert.equal(g('owner', 'R2'), undefined);
    assert.equal(g('taker', 'R1'), 1);
    assert.equal(g('taker', 'R2'), 1);
    assert.equal(g('taker', 'E1'), undefined);
    assert.equal(g('owner', 'E1'), 1);
  });
});
