import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import {
  getTopupBonusState, claimTopupBonus, TOPUP_BONUS_MILESTONES, CLAIM_GRACE_DAYS,
} from '../../src/lib/topupBonus.js';
import {
  jakartaMonthKey, jakartaMonthRange, prevMonthKey, nextMonthKey,
} from '../../src/lib/jakartaTime.js';

// Waktu uji (WIB = UTC+7):
const NOW_OCT = new Date('2026-10-15T05:00:00Z');   // 15 Okt 2026 12:00 WIB
const NOW_NOV_2 = new Date('2026-11-02T05:00:00Z'); // 2 Nov 2026 12:00 WIB (masa tenggang)
const NOW_NOV_4 = new Date('2026-11-04T05:00:00Z'); // 4 Nov 2026 12:00 WIB (lewat tenggang)

const octMs = (day, hour = 12) => Date.UTC(2026, 9, day, hour - 7); // Jam WIB -> UTC ms
const sepMs = (day, hour = 12) => Date.UTC(2026, 8, day, hour - 7);
const novMs = (day, hour = 12) => Date.UTC(2026, 10, day, hour - 7);

async function makeDb() {
  const db = createClient({ url: 'file::memory:' });
  await db.execute(`
    CREATE TABLE shop_orders (
      order_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      ref TEXT NOT NULL DEFAULT '',
      amount_idr INTEGER NOT NULL DEFAULT 0,
      xp_amount INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      paid_at INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  return db;
}

async function addOrder(db, {
  orderId, userId = 'u1', kind = 'xp', ref = 'xp-5k', amountIdr = 5000,
  status = 'paid', paidAt = octMs(5), createdAt = paidAt, updatedAt = paidAt,
} = {}) {
  await db.execute({
    sql: `INSERT INTO shop_orders
          (order_id, user_id, kind, ref, amount_idr, xp_amount, status, paid_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
    args: [orderId, userId, kind, ref, amountIdr, status, paidAt, createdAt, updatedAt],
  });
}

function grantStub(cards) {
  return async () => ({ granted: cards, requested: [] });
}

const fakeEpic = { charName: 'Epic Test', rarity: 'Epic' };
const fakeLegend = { charName: 'Legend Test', rarity: 'Legendary' };

describe('jakarta month helpers', () => {
  it('kunci bulan & rentang WIB benar', () => {
    assert.equal(jakartaMonthKey(NOW_OCT), '2026-10');
    assert.equal(jakartaMonthKey(NOW_NOV_2), '2026-11');
    const { startMs, endMs } = jakartaMonthRange('2026-10');
    // 1 Okt 2026 00:00 WIB = 30 Sep 2026 17:00 UTC
    assert.equal(startMs, Date.UTC(2026, 8, 30, 17, 0, 0));
    // 1 Nov 2026 00:00 WIB = 31 Okt 2026 17:00 UTC
    assert.equal(endMs, Date.UTC(2026, 9, 31, 17, 0, 0));
  });
  it('prev/next lintas tahun', () => {
    assert.equal(prevMonthKey('2026-01'), '2025-12');
    assert.equal(nextMonthKey('2026-12'), '2027-01');
  });
});

describe('state bonus top-up bulanan', () => {
  it('5k + 5k dihitung 10k; pending/refund/slot tidak dihitung', async () => {
    const db = await makeDb();
    await addOrder(db, { orderId: 'o1', amountIdr: 5000, paidAt: octMs(2) });
    await addOrder(db, { orderId: 'o2', amountIdr: 5000, paidAt: octMs(3) });
    await addOrder(db, { orderId: 'o3', amountIdr: 5000, status: 'pending', paidAt: 0, createdAt: octMs(4), updatedAt: octMs(4) });
    await addOrder(db, { orderId: 'o4', amountIdr: 5000, status: 'refund', paidAt: octMs(5) });
    await addOrder(db, { orderId: 'o5', kind: 'slot', ref: 'display-slot', amountIdr: 10000, paidAt: octMs(6) });

    const state = await getTopupBonusState('u1', { db, now: NOW_OCT, launchAt: 0, ensureTables: true });
    assert.equal(state.totalIdr, 10000);
    assert.equal(state.period, '2026-10');
    assert.equal(state.periodLabel, 'Oktober 2026');
    assert.deepEqual(state.milestones.map((m) => m.progressPct), [20, 10, 2]);
    for (const m of state.milestones) {
      assert.equal(m.reached, false);
      assert.equal(m.canClaim, false);
    }
  });

  it('total 50k membuka bar 50k saja', async () => {
    const db = await makeDb();
    await addOrder(db, { orderId: 'o1', amountIdr: 30000, paidAt: octMs(2) });
    await addOrder(db, { orderId: 'o2', amountIdr: 20000, paidAt: octMs(3) });

    const state = await getTopupBonusState('u1', { db, now: NOW_OCT, launchAt: 0, ensureTables: true });
    assert.equal(state.totalIdr, 50000);
    const [b50, b100, b500] = state.milestones;
    assert.equal(b50.canClaim, true);
    assert.equal(b50.progressPct, 100);
    assert.equal(b100.canClaim, false);
    assert.equal(b100.progressPct, 50);
    assert.equal(b500.progressPct, 10);
  });

  it('order bulan lalu tidak ikut dihitung bulan ini (pakai paid_at)', async () => {
    const db = await makeDb();
    await addOrder(db, { orderId: 'sep', amountIdr: 50000, paidAt: sepMs(30, 23) });
    await addOrder(db, { orderId: 'okt', amountIdr: 5000, paidAt: octMs(1, 0) });

    const state = await getTopupBonusState('u1', { db, now: NOW_OCT, launchAt: 0, ensureTables: true });
    assert.equal(state.totalIdr, 5000);
  });

  it('claim 50k sukses, klaim kedua idempoten tanpa kartu dobel', async () => {
    const db = await makeDb();
    await addOrder(db, { orderId: 'o1', amountIdr: 50000, paidAt: octMs(2) });

    let calls = 0;
    const grant = async () => { calls++; return { granted: [fakeEpic], requested: [] }; };

    const first = await claimTopupBonus('u1', 'Tester', 'topup_50k', {
      db, now: NOW_OCT, launchAt: 0, ensureTables: true, grant,
    });
    assert.equal(first.ok, true);
    assert.equal(first.cards.length, 1);
    assert.equal(first.period, '2026-10');

    const second = await claimTopupBonus('u1', 'Tester', 'topup_50k', {
      db, now: NOW_OCT, launchAt: 0, ensureTables: true, grant,
    });
    assert.equal(second.ok, true);
    assert.equal(second.alreadyClaimed, true);
    assert.equal(calls, 1);

    const rows = await db.execute('SELECT COUNT(*) AS c FROM topup_bonus_claims');
    assert.equal(Number(rows.rows[0].c), 1);

    const state = await getTopupBonusState('u1', { db, now: NOW_OCT, launchAt: 0, ensureTables: true });
    const b50 = state.milestones.find((m) => m.id === 'topup_50k');
    assert.equal(b50.claimed, true);
    assert.equal(b50.canClaim, false);
    assert.equal(b50.claimedCards.length, 1);
  });

  it('claim ditolak kalau bar belum penuh', async () => {
    const db = await makeDb();
    await addOrder(db, { orderId: 'o1', amountIdr: 49000, paidAt: octMs(2) });
    const r = await claimTopupBonus('u1', 'Tester', 'topup_50k', {
      db, now: NOW_OCT, launchAt: 0, ensureTables: true, grant: grantStub([fakeEpic]),
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /belum penuh/i);
  });

  it('gagal grant kartu melepas klaim supaya bisa retry', async () => {
    const db = await makeDb();
    await addOrder(db, { orderId: 'o1', amountIdr: 50000, paidAt: octMs(2) });

    let fail = true;
    const grant = async () => {
      if (fail) throw new Error('stok kosong');
      return { granted: [fakeEpic], requested: [] };
    };

    const first = await claimTopupBonus('u1', 'Tester', 'topup_50k', {
      db, now: NOW_OCT, launchAt: 0, ensureTables: true, grant,
    });
    assert.equal(first.ok, false);
    const rows = await db.execute('SELECT COUNT(*) AS c FROM topup_bonus_claims');
    assert.equal(Number(rows.rows[0].c), 0);

    fail = false;
    const retry = await claimTopupBonus('u1', 'Tester', 'topup_50k', {
      db, now: NOW_OCT, launchAt: 0, ensureTables: true, grant,
    });
    assert.equal(retry.ok, true);
    assert.equal(retry.cards.length, 1);
  });

  it('order bonus paket lama (sebelum fitur live) dianggap sudah diklaim', async () => {
    const db = await makeDb();
    const launchAt = octMs(21); // fitur live 21 Okt
    await addOrder(db, { orderId: 'legacy', ref: 'xp-50k', amountIdr: 50000, paidAt: octMs(20) });
    await addOrder(db, { orderId: 'after', ref: 'xp-50k', amountIdr: 50000, paidAt: octMs(22) });

    const state = await getTopupBonusState('u1', { db, now: NOW_OCT, launchAt, ensureTables: true });
    assert.equal(state.totalIdr, 100000);
    const b50 = state.milestones.find((m) => m.id === 'topup_50k');
    const b100 = state.milestones.find((m) => m.id === 'topup_100k');
    assert.equal(b50.claimed, true);
    assert.equal(b50.legacyClaimed, true);
    assert.equal(b50.canClaim, false);
    assert.equal(b100.canClaim, true);

    const r = await claimTopupBonus('u1', 'Tester', 'topup_50k', {
      db, now: NOW_OCT, launchAt, ensureTables: true, grant: grantStub([fakeEpic]),
    });
    assert.equal(r.ok, true);
    assert.equal(r.alreadyClaimed, true);
    assert.equal(r.legacy, true);
  });

  it('masa tenggang tgl 1-3: milestone bulan lalu masih bisa diklaim', async () => {
    const db = await makeDb();
    await addOrder(db, { orderId: 'o1', amountIdr: 50000, paidAt: octMs(10) });

    const state = await getTopupBonusState('u1', { db, now: NOW_NOV_2, launchAt: 0, ensureTables: true });
    assert.equal(state.period, '2026-11');
    assert.equal(state.totalIdr, 0);
    assert.ok(state.grace);
    assert.equal(state.grace.period, '2026-10');
    assert.equal(state.grace.canClaimCount, 1);

    const r = await claimTopupBonus('u1', 'Tester', 'topup_50k', {
      db,
      now: NOW_NOV_2,
      period: '2026-10',
      launchAt: 0,
      ensureTables: true,
      grant: grantStub([fakeEpic]),
    });
    assert.equal(r.ok, true);
    assert.equal(r.period, '2026-10');

    const after = await getTopupBonusState('u1', { db, now: NOW_NOV_2, launchAt: 0, ensureTables: true });
    assert.equal(after.grace, null);
  });

  it('lewat tanggal 3, klaim bulan lalu ditolak dan grace hilang', async () => {
    const db = await makeDb();
    await addOrder(db, { orderId: 'o1', amountIdr: 50000, paidAt: octMs(10) });

    const state = await getTopupBonusState('u1', { db, now: NOW_NOV_4, launchAt: 0, ensureTables: true });
    assert.equal(state.grace, null);

    const r = await claimTopupBonus('u1', 'Tester', 'topup_50k', {
      db,
      now: NOW_NOV_4,
      period: '2026-10',
      launchAt: 0,
      ensureTables: true,
      grant: grantStub([fakeEpic]),
    });
    assert.equal(r.ok, false);
    assert.match(r.error, /berakhir/i);
  });

  it('milestone 100k & 500k memberi reward sesuai definisi', async () => {
    const db = await makeDb();
    await addOrder(db, { orderId: 'o1', amountIdr: 500000, paidAt: novMs(5) });
    const nowNov = new Date('2026-11-15T05:00:00Z');

    const r100 = await claimTopupBonus('u1', 'Tester', 'topup_100k', {
      db, now: nowNov, launchAt: 0, ensureTables: true, grant: grantStub([fakeLegend]),
    });
    assert.equal(r100.ok, true);

    const r500 = await claimTopupBonus('u1', 'Tester', 'topup_500k', {
      db, now: nowNov, launchAt: 0, ensureTables: true,
      grant: grantStub([fakeLegend, fakeLegend, { charName: 'Mythic Test', rarity: 'Mythic' }]),
    });
    assert.equal(r500.ok, true);
    assert.equal(r500.cards.length, 3);

    assert.equal(TOPUP_BONUS_MILESTONES.length, 3);
    assert.equal(CLAIM_GRACE_DAYS, 3);
  });
});
