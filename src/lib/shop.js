import { createHash } from 'node:crypto';
import { getDb } from './db.js';

// Katalog Shop Animein: Top-Up XP + Slot Kartu Pajangan custom.
// Harga dalam Rupiah, XP otomatis masuk setelah pembayaran sukses via Midtrans.

export const XP_PACKS = [
  { id: 'xp-5k', priceIdr: 5000, xp: 6000 },
  { id: 'xp-10k', priceIdr: 10000, xp: 11500 },
  { id: 'xp-50k', priceIdr: 50000, xp: 55000 },
  { id: 'xp-100k', priceIdr: 100000, xp: 125000 },
];

export const SLOT_PRICE_IDR = 10000;
export const MAX_SLOTS_PER_USER = 50;
// Order pending yang tidak dibayar dalam 5 menit otomatis kadaluarsa.
export const ORDER_PENDING_TTL_MS = 5 * 60 * 1000;
// Tiap slot = 1 kartu pajangan custom dengan 3x jatah ubah (tiap Simpan makan 1).
export const MAX_EDITS_PER_SLOT = 3;

export const SLOT_BORDER_TYPES = ['gold', 'rainbow', 'neon', 'sakura', 'shadow', 'classic', 'custom'];

export function findPack(packId) {
  return XP_PACKS.find((p) => p.id === String(packId || '')) || null;
}

export function editsLeft(slot) {
  return Math.max(0, MAX_EDITS_PER_SLOT - (Number(slot?.edits_used) || 0));
}

function isProduction() {
  return String(process.env.MIDTRANS_IS_PRODUCTION || 'false').toLowerCase() === 'true';
}

export function midtransBaseUrl() {
  return isProduction() ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
}

export function snapJsUrl() {
  return `${midtransBaseUrl()}/snap/snap.js`;
}

export function isMidtransConfigured() {
  return Boolean(process.env.MIDTRANS_SERVER_KEY) && Boolean(process.env.MIDTRANS_CLIENT_KEY);
}

// Buat transaksi Snap. Return { token, redirectUrl }.
export async function createSnapTransaction({ orderId, grossAmount, itemName, username }) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
  if (!serverKey) throw new Error('MIDTRANS_SERVER_KEY belum diisi');
  const res = await fetch(`${midtransBaseUrl()}/snap/v1/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`,
    },
    body: JSON.stringify({
      transaction_details: { order_id: orderId, gross_amount: grossAmount },
      // Daftar channel diatur di dashboard Midtrans (Snap Checkout > Payment methods):
      // nyalakan HANYA GoPay/GoPay Later (Always show QRIS) + Other QRIS,
      // matikan VA, kartu, retail, dsb. Tanpa enabled_payments agar ikut dashboard.
      item_details: [{ id: orderId, price: grossAmount, quantity: 1, name: String(itemName).slice(0, 50) }],
      customer_details: { first_name: String(username || 'Animein').slice(0, 50) },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    const msg = Array.isArray(data?.error_messages) ? data.error_messages.join('; ') : data?.message;
    throw new Error(msg || `Midtrans ${res.status}`);
  }
  return { token: data.token, redirectUrl: data.redirect_url || null };
}

// Verifikasi signature webhook: sha512(order_id + status_code + gross_amount + serverKey).
export function verifyWebhookSignature({ orderId, statusCode, grossAmount, signature }, serverKey) {
  const raw = `${orderId}${statusCode}${grossAmount}${serverKey || process.env.MIDTRANS_SERVER_KEY || ''}`;
  const expected = createHash('sha512').update(raw).digest('hex');
  return expected === String(signature || '').toLowerCase();
}

export function midtransApiBaseUrl() {
  return isProduction() ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
}

// Ambil status transaksi langsung dari Midtrans (dipakai tombol "Cek Status"
// dan sinkronisasi otomatis — penting untuk localhost yang tak terjangkau webhook).
export async function fetchTransactionStatus(orderId) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY || '';
  if (!serverKey) throw new Error('MIDTRANS_SERVER_KEY belum diisi');
  const res = await fetch(`${midtransApiBaseUrl()}/v2/${encodeURIComponent(String(orderId))}/status`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString('base64')}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.status_message || `Midtrans ${res.status}`);
  return data;
}

// Sinkronkan 1 order pending ke status Midtrans + penuhi bila lunas.
// Return { status: 'paid'|'pending'|'failed'|'expired'|'unknown', reason? }.
export async function syncOrderFromMidtrans(orderId) {
  const order = await getOrder(orderId);
  if (!order) return { status: 'unknown' };
  if (order.status !== 'pending') return { status: order.status };
  const st = await fetchTransactionStatus(orderId);
  const tx = String(st.transaction_status || '');
  if (tx === 'capture' || tx === 'settlement') {
    if (tx === 'capture' && String(st.fraud_status) === 'challenge') return { status: 'pending' };
    const r = await fulfillPaidOrder(order);
    if (!r.fulfilled && r.reason !== 'bukan pending') return { status: order.status, reason: r.reason };
    return { status: 'paid' };
  }
  if (tx === 'pending') return { status: 'pending' };
  if (['deny', 'cancel', 'failure'].includes(tx)) {
    await setOrderStatus(orderId, 'failed');
    return { status: 'failed' };
  }
  if (tx === 'expire') {
    await setOrderStatus(orderId, 'expired');
    return { status: 'expired' };
  }
  return { status: order.status };
}

export function genMerchantOrderId() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `ANIMEIN-${Date.now()}-${rand}`;
}

function calcLevel(xp) {
  let lv = 1;
  while (xp >= Math.floor(20 * Math.pow(lv, 3))) lv++;
  return lv;
}

export async function ensureShopTables() {
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shop_orders (
      order_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL,
      ref TEXT NOT NULL DEFAULT '',
      qty INTEGER DEFAULT 1,
      amount_idr INTEGER NOT NULL,
      xp_amount INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      snap_token TEXT DEFAULT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_shop_orders_user ON shop_orders (user_id, created_at DESC)');
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_display_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT 'Kartu Custom',
      image_url TEXT DEFAULT NULL,
      border_type TEXT NOT NULL DEFAULT 'classic',
      border_color TEXT NOT NULL DEFAULT '',
      edits_used INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_display_slots_user ON user_display_slots (user_id)');
}

export async function createOrder({ userId, username, kind, ref, qty, amountIdr, xpAmount, snapToken }) {
  const db = getDb();
  await ensureShopTables();
  const orderId = genMerchantOrderId();
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO shop_orders (order_id, user_id, username, kind, ref, qty, amount_idr, xp_amount, status, snap_token, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    args: [orderId, String(userId), String(username || ''), kind, String(ref || ''), Number(qty) || 1, amountIdr, xpAmount || 0, snapToken || null, now, now],
  });
  return orderId;
}

export async function getOrder(orderId) {
  const res = await getDb().execute({ sql: 'SELECT * FROM shop_orders WHERE order_id = ?', args: [String(orderId)] });
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    orderId: String(r.order_id),
    userId: String(r.user_id),
    username: String(r.username || ''),
    kind: String(r.kind),
    ref: String(r.ref || ''),
    qty: Number(r.qty) || 1,
    amountIdr: Number(r.amount_idr) || 0,
    xpAmount: Number(r.xp_amount) || 0,
    status: String(r.status),
  };
}

export async function setOrderStatus(orderId, status) {
  await getDb().execute({
    sql: 'UPDATE shop_orders SET status = ?, updated_at = ? WHERE order_id = ?',
    args: [status, Date.now(), String(orderId)],
  });
}

// Tandai pending yang lebih tua dari TTL sebagai expired. Return jumlah yang diubah.
export async function expireStalePendingOrders(userId) {
  const res = await getDb().execute({
    sql: `UPDATE shop_orders SET status = 'expired', updated_at = ?
          WHERE user_id = ? AND status = 'pending' AND created_at < ?`,
    args: [Date.now(), String(userId), Date.now() - ORDER_PENDING_TTL_MS],
  });
  return Number(res.rowsAffected || 0);
}

export async function listUserOrders(userId, limit = 10) {
  const res = await getDb().execute({
    sql: 'SELECT order_id, kind, ref, qty, amount_idr, xp_amount, status, created_at FROM shop_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    args: [String(userId), Math.min(20, Math.max(1, Number(limit) || 10))],
  });
  return (res.rows || []).map((r) => ({
    orderId: String(r.order_id),
    kind: String(r.kind),
    ref: String(r.ref || ''),
    qty: Number(r.qty) || 1,
    amountIdr: Number(r.amount_idr) || 0,
    xpAmount: Number(r.xp_amount) || 0,
    status: String(r.status),
    createdAt: Number(r.created_at) || 0,
  }));
}

async function addXpToUser(userId, username, amount) {
  const db = getDb();
  const cur = await db.execute({ sql: 'SELECT xp FROM user_stats WHERE user_id = ?', args: [String(userId)] });
  const curXp = cur.rows.length > 0 ? Number(cur.rows[0].xp) || 0 : 0;
  const newXp = curXp + (Number(amount) || 0);
  await db.execute({
    sql: `INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level, username = excluded.username`,
    args: [String(userId), String(username || ''), newXp, calcLevel(newXp)],
  });
  return newXp;
}

export async function countUserSlots(userId) {
  const res = await getDb().execute({
    sql: 'SELECT COUNT(*) AS c FROM user_display_slots WHERE user_id = ?',
    args: [String(userId)],
  });
  return Number(res.rows[0]?.c || 0);
}

// Penuhi order yang sudah dibayar (idempoten: hanya dari status pending).
// Return { fulfilled: true } atau { fulfilled: false, reason }.
export async function fulfillPaidOrder(order) {
  const db = getDb();
  await ensureShopTables();
  const fresh = await getOrder(order.orderId);
  if (!fresh || fresh.status !== 'pending') return { fulfilled: false, reason: 'bukan pending' };
  if (fresh.kind === 'xp') {
    await addXpToUser(fresh.userId, fresh.username, fresh.xpAmount);
  } else if (fresh.kind === 'slot') {
    const have = await countUserSlots(fresh.userId);
    const room = Math.max(0, MAX_SLOTS_PER_USER - have);
    const grant = Math.min(room, fresh.qty);
    const now = Date.now();
    for (let i = 0; i < grant; i++) {
      await db.execute({
        sql: `INSERT INTO user_display_slots (user_id, username, name, created_at, updated_at)
              VALUES (?, ?, 'Kartu Custom', ?, ?)`,
        args: [fresh.userId, fresh.username, now, now],
      });
    }
    if (grant < fresh.qty) return { fulfilled: false, reason: 'slot penuh (maks 50)' };
  } else {
    return { fulfilled: false, reason: 'jenis tak dikenal' };
  }
  await setOrderStatus(fresh.orderId, 'paid');
  return { fulfilled: true };
}

export async function listUserSlots(userId) {
  await ensureShopTables();
  const res = await getDb().execute({
    sql: 'SELECT id, name, image_url, border_type, border_color, edits_used, created_at FROM user_display_slots WHERE user_id = ? ORDER BY id ASC',
    args: [String(userId)],
  });
  return (res.rows || []).map((r) => ({
    id: Number(r.id),
    name: String(r.name || 'Kartu Custom'),
    imageUrl: r.image_url || null,
    borderType: String(r.border_type || 'classic'),
    borderColor: String(r.border_color || ''),
    editsUsed: Number(r.edits_used) || 0,
    editsLeft: editsLeft({ edits_used: r.edits_used }),
  }));
}

function cleanHex(v) {
  const s = String(v || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return '';
}

// Update kartu 1 slot: tiap Simpan makan 1 jatah (maks 3). Return { ok } / { ok:false, error }.
export async function updateSlotCard(userId, slotId, input = {}) {
  await ensureShopTables();
  const res = await getDb().execute({
    sql: 'SELECT id, edits_used FROM user_display_slots WHERE id = ? AND user_id = ?',
    args: [Number(slotId), String(userId)],
  });
  if (res.rows.length === 0) return { ok: false, error: 'Slot tidak ditemukan.' };
  const used = Number(res.rows[0].edits_used) || 0;
  if (used >= MAX_EDITS_PER_SLOT) {
    return { ok: false, error: 'Jatah ubah habis (3x). Beli slot baru untuk kartu berikutnya.' };
  }
  const name = String(input.name || '').trim().slice(0, 40);
  if (!name) return { ok: false, error: 'Nama kartu wajib diisi (maks 40 karakter).' };
  const imageUrl = String(input.imageUrl || '').trim();
  if (imageUrl && (imageUrl.length > 2000 || !/^https?:\/\/.+/i.test(imageUrl))) {
    return { ok: false, error: 'URL gambar harus http(s), maks 2000 karakter.' };
  }
  const borderType = SLOT_BORDER_TYPES.includes(String(input.borderType)) ? String(input.borderType) : 'classic';
  const borderColor = borderType === 'custom' ? cleanHex(input.borderColor) : '';
  if (borderType === 'custom' && !borderColor) return { ok: false, error: 'Warna custom harus hex (contoh #a855f7).' };
  await getDb().execute({
    sql: `UPDATE user_display_slots
          SET name = ?, image_url = ?, border_type = ?, border_color = ?,
              edits_used = edits_used + 1, updated_at = ?
          WHERE id = ? AND user_id = ?`,
    args: [name, imageUrl || null, borderType, borderColor, Date.now(), Number(slotId), String(userId)],
  });
  return { ok: true, editsLeft: MAX_EDITS_PER_SLOT - used - 1 };
}
