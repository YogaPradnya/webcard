import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// DB in-memory dipakai agar fulfillPaidOrder diuji end-to-end tanpa Turso.
process.env.TURSO_URL = 'file::memory:';
process.env.TURSO_AUTH_TOKEN = '';

const {
  createPendingOrder, setOrderPayment, getOrder, fulfillPaidOrder,
  listUserOrders, ensureShopTables, transitionOrderStatus,
} = await import('../../src/lib/shop.js');
const { getDb } = await import('../../src/lib/db.js');
const { ensureMissionTables, jakartaWeekKey } = await import('../../src/lib/missions.js');

const db = getDb();

before(async () => {
  await ensureShopTables();
  await ensureMissionTables();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_stats (
      user_id TEXT PRIMARY KEY,
      username TEXT,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      custom_title TEXT DEFAULT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      char_name TEXT NOT NULL,
      anime TEXT NOT NULL DEFAULT '',
      rarity TEXT NOT NULL DEFAULT 'Common',
      level INTEGER DEFAULT 1,
      power INTEGER DEFAULT 0,
      image_url TEXT DEFAULT NULL,
      is_showcase INTEGER DEFAULT 0,
      quantity INTEGER DEFAULT 1,
      pulled_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_user_char ON user_cards (user_id, char_name)');
});

beforeEach(async () => {
  await db.execute('DELETE FROM shop_orders');
  await db.execute('DELETE FROM user_display_slots');
  await db.execute('DELETE FROM user_stats');
  await db.execute('DELETE FROM user_cards');
  await db.execute('DELETE FROM mission_progress');
  await db.execute('DELETE FROM mission_claims');
});

async function makeXpOrder(overrides = {}) {
  const orderId = overrides.orderId || 'order-xp-1';
  await createPendingOrder({
    orderId,
    userId: 'user-1',
    username: 'Yogaa',
    kind: 'xp',
    ref: 'xp-5k',
    qty: 1,
    amountIdr: 5000,
    xpAmount: 6000,
    ...overrides,
  });
  return orderId;
}

describe('shop fulfill atomik', () => {
  it('insert pending dulu, lalu set data pembayaran tanpa mengubah status', async () => {
    const orderId = await makeXpOrder();
    const pending = await getOrder(orderId);
    assert.equal(pending.status, 'pending');
    assert.equal(pending.payId, '');

    await setOrderPayment(orderId, {
      payId: 'T-123',
      qrUrl: 'https://tripay.test/qr.png',
      qrContent: '000201',
      checkoutUrl: 'https://tripay.test/checkout',
      channelName: 'QRIS',
    });

    const saved = await getOrder(orderId);
    assert.equal(saved.status, 'pending');
    assert.equal(saved.payId, 'T-123');
    assert.equal(saved.qrUrl, 'https://tripay.test/qr.png');
    assert.equal(saved.payChannel, 'QRIS');
  });

  it('callback bisa memenuhi order yang sudah diinsert tapi pay_id belum tersimpan', async () => {
    const orderId = await makeXpOrder();
    await db.execute({
      sql: 'INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, 0, 1)',
      args: ['user-1', 'Yogaa'],
    });

    const windowOrder = await getOrder(orderId);
    assert.equal(windowOrder.payId, ''); // simulasi callback balapan setOrderPayment
    const r = await fulfillPaidOrder(windowOrder, { paymentType: 'QRIS' });
    assert.equal(r.fulfilled, true);
    assert.equal((await getOrder(orderId)).status, 'paid');

    const xp = await db.execute({
      sql: 'SELECT xp FROM user_stats WHERE user_id = ?',
      args: ['user-1'],
    });
    assert.equal(Number(xp.rows[0].xp), 6000);
  });

  it('dua fulfillment bersamaan hanya menambah XP satu kali', async () => {
    const orderId = await makeXpOrder();
    await db.execute({
      sql: 'INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, ?, ?)',
      args: ['user-1', 'Yogaa', 100, 1],
    });

    const order = await getOrder(orderId);
    const results = await Promise.all([
      fulfillPaidOrder(order, { paymentType: 'QRIS' }),
      fulfillPaidOrder(order, { paymentType: 'QRIS' }),
    ]);

    const xp = await db.execute({
      sql: 'SELECT xp FROM user_stats WHERE user_id = ?',
      args: ['user-1'],
    });
    assert.equal(Number(xp.rows[0].xp), 6100);

    const actual = await db.execute({
      sql: 'SELECT status, paid_at, payment_type FROM shop_orders WHERE order_id = ?',
      args: [orderId],
    });
    assert.equal(actual.rows[0].status, 'paid');
    assert.ok(Number(actual.rows[0].paid_at) > 0);
    assert.equal(actual.rows[0].payment_type, 'QRIS');

    const fulfilled = results.filter((r) => r.fulfilled && !r.alreadyPaid).length;
    assert.equal(fulfilled, 1);
  });

  it('order expired yang ternyata dibayar tetap dipenuhi', async () => {
    const orderId = await makeXpOrder();
    await db.execute({
      sql: "UPDATE shop_orders SET status = 'expired' WHERE order_id = ?",
      args: [orderId],
    });
    await db.execute({
      sql: 'INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, 0, 1)',
      args: ['user-1', 'Yogaa'],
    });

    const r = await fulfillPaidOrder(await getOrder(orderId), { paymentType: 'QRIS' });
    assert.equal(r.fulfilled, true);
    assert.equal((await getOrder(orderId)).status, 'paid');
    const xp = await db.execute({
      sql: 'SELECT xp FROM user_stats WHERE user_id = ?',
      args: ['user-1'],
    });
    assert.equal(Number(xp.rows[0].xp), 6000);
  });

  it('jenis order tak dikenal melepas klaim processing', async () => {
    const orderId = await createPendingOrder({
      orderId: 'order-bogus',
      userId: 'user-1',
      username: 'Yogaa',
      kind: 'bogus',
      ref: 'x',
      qty: 1,
      amountIdr: 1000,
      xpAmount: 0,
    });
    const r = await fulfillPaidOrder(await getOrder(orderId));
    assert.equal(r.fulfilled, false);
    assert.match(r.reason, /jenis tak dikenal/);
    assert.equal((await getOrder(orderId)).status, 'pending');
  });

  it('list order menampilkan pending lama sebagai expired tanpa menulis DB', async () => {
    const orderId = await makeXpOrder();
    const old = Date.now() - (16 * 60 * 1000);
    await db.execute({
      sql: 'UPDATE shop_orders SET created_at = ? WHERE order_id = ?',
      args: [old, orderId],
    });

    const list = await listUserOrders('user-1');
    assert.equal(list[0].status, 'expired');

    const raw = await db.execute({
      sql: 'SELECT status FROM shop_orders WHERE order_id = ?',
      args: [orderId],
    });
    assert.equal(raw.rows[0].status, 'pending');
  });

  it('order tak dikenal tidak pernah menambah XP', async () => {
    const r = await fulfillPaidOrder({ orderId: 'tidak-ada' });
    assert.equal(r.fulfilled, false);
    const count = await db.execute('SELECT COUNT(*) AS c FROM user_stats');
    assert.equal(Number(count.rows[0].c), 0);
  });

  it('transisi failed/expired tidak boleh menimpa order yang sudah paid', async () => {
    const orderId = await makeXpOrder();
    await db.execute({
      sql: "UPDATE shop_orders SET status = 'paid' WHERE order_id = ?",
      args: [orderId],
    });
    const changed = await transitionOrderStatus(orderId, 'failed', ['pending', 'expired']);
    assert.equal(changed, 0);
    assert.equal((await getOrder(orderId)).status, 'paid');
  });

  it('top-up 50k tidak memberi kartu otomatis, tapi mencatat misi topup mingguan', async () => {
    const orderId = await makeXpOrder({
      orderId: 'order-xp-50k',
      ref: 'xp-50k',
      amountIdr: 50000,
      xpAmount: 55000,
    });
    const r = await fulfillPaidOrder(await getOrder(orderId), { paymentType: 'QRIS' });
    assert.equal(r.fulfilled, true);
    assert.equal(r.bonus, undefined);

    const xp = await db.execute({
      sql: 'SELECT xp FROM user_stats WHERE user_id = ?',
      args: ['user-1'],
    });
    assert.equal(Number(xp.rows[0].xp), 55000);

    // Bonus kartu sekarang hanya keluar lewat klaim Bonus Top-Up Bulanan.
    const cards = await db.execute({
      sql: 'SELECT COUNT(*) AS c FROM user_cards WHERE user_id = ?',
      args: ['user-1'],
    });
    assert.equal(Number(cards.rows[0].c), 0);

    const mission = await db.execute({
      sql: 'SELECT count FROM mission_progress WHERE user_id = ? AND period = ? AND mission_id = ?',
      args: ['user-1', `w:${jakartaWeekKey()}`, 'topup_1'],
    });
    assert.equal(mission.rows.length, 1);
    assert.equal(Number(mission.rows[0].count), 1);
  });

  it('top-up 500k tidak memberi kartu otomatis dan mengisi paid_at untuk periode bonus', async () => {
    const orderId = await makeXpOrder({
      orderId: 'order-xp-500k',
      ref: 'xp-500k',
      amountIdr: 500000,
      xpAmount: 650000,
    });
    const r = await fulfillPaidOrder(await getOrder(orderId), { paymentType: 'QRIS' });
    assert.equal(r.fulfilled, true);
    assert.equal(r.bonus, undefined);

    const cards = await db.execute({
      sql: 'SELECT COUNT(*) AS c FROM user_cards WHERE user_id = ?',
      args: ['user-1'],
    });
    assert.equal(Number(cards.rows[0].c), 0);

    const row = await db.execute({
      sql: 'SELECT paid_at FROM shop_orders WHERE order_id = ?',
      args: [orderId],
    });
    assert.ok(Number(row.rows[0].paid_at) > 0);
  });
});
