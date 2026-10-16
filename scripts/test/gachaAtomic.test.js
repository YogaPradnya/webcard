import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { debitXp, creditXp, getUserXp } from '../../src/lib/userCardsRepo.js';

// Mock user_stats: tiap execute dieksekusi sinkron-atomik seperti 1 statement SQLite.
function mockDb(xpByUser = {}) {
  const stats = new Map(Object.entries(xpByUser).map(([k, v]) => [k, { xp: v, level: 1, username: 'u' }]));
  return {
    stats,
    async execute({ sql, args }) {
      const q = String(sql);
      if (q.startsWith('SELECT xp FROM user_stats')) {
        const r = stats.get(String(args[0]));
        return { rows: r ? [{ xp: r.xp }] : [] };
      }
      if (q.includes('SET xp = xp - ?') && q.includes('AND xp >=')) {
        const r = stats.get(String(args[1]));
        if (r && r.xp >= Number(args[0])) {
          r.xp -= Number(args[0]);
          return { rows: [], rowsAffected: 1 };
        }
        return { rows: [], rowsAffected: 0 };
      }
      if (q.includes('SET xp = xp + ?')) {
        const r = stats.get(String(args[1]));
        if (r) r.xp += Number(args[0]);
        return { rows: [], rowsAffected: r ? 1 : 0 };
      }
      if (q.startsWith('INSERT INTO user_stats')) {
        const [uid, uname, xp, lv] = args;
        const cur = stats.get(String(uid));
        if (!cur) stats.set(String(uid), { xp: Number(xp) || 0, level: lv, username: uname });
        else { cur.level = lv; cur.username = uname; }
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

describe('debit XP atomik (anti double-spend)', () => {
  it('dokumentasi lubang pola lama: baca-lalu-tulis dobel lolos bersamaan', async () => {
    const db = mockDb({ u: 500 });
    // Simulasi 2 tab: keduanya baca 500 sebelum salah satu menulis.
    const checkThenAct = async () => {
      const cur = await getUserXp(db, 'u');
      await Promise.resolve(); // titik interleave
      if (cur < 500) return false;
      db.stats.get('u').xp -= 500;
      return true;
    };
    const [a, b] = await Promise.all([checkThenAct(), checkThenAct()]);
    assert.equal(a && b, true); // keduanya lolos = bug pola lama
    assert.equal(db.stats.get('u').xp, -500); // overdraw!
  });

  it('debitXp konkuren: tepat 1 pemenang, saldo tidak negatif', async () => {
    const db = mockDb({ u: 500 });
    const [a, b] = await Promise.all([debitXp(db, 'u', 500), debitXp(db, 'u', 500)]);
    assert.equal([a.ok, b.ok].filter(Boolean).length, 1);
    assert.equal(db.stats.get('u').xp, 0);
  });

  it('dana pas lalu kurang: kedua tetap benar', async () => {
    const db = mockDb({ u: 500 });
    const a = await debitXp(db, 'u', 500);
    assert.equal(a.ok, true);
    assert.equal(a.xpBefore, 500);
    const b = await debitXp(db, 'u', 1);
    assert.equal(b.ok, false);
    assert.equal(db.stats.get('u').xp, 0);
  });

  it('tanpa baris user + gratis (0) tetap ok', async () => {
    const db = mockDb({});
    const r = await debitXp(db, 'new', 0);
    assert.equal(r.ok, true);
    const r2 = await debitXp(db, 'new', 500);
    assert.equal(r2.ok, false);
  });

  it('creditXp menambah (refund Parsial)', async () => {
    const db = mockDb({ u: 0 });
    await creditXp(db, 'u', 150);
    assert.equal(db.stats.get('u').xp, 150);
  });
});
