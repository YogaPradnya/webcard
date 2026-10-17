import { createHash, randomInt } from 'node:crypto';
import { getDb } from './db.js';
import { isSchemaReady } from './schema.js';
import { calcLevel } from './level.js';
import { cleanHex } from './color.js';
import { DISPLAY_BORDERS } from './constants.js';

// Katalog Shop Animein: Top-Up XP + Slot Kartu Pajangan custom.
// Harga dalam Rupiah, XP otomatis masuk setelah pembayaran sukses via PayDisini.

// Feature flag Shop: tampil hanya bila NEXT_PUBLIC_SHOP_ENABLED=true.
// Matikan (default) sampai key production PayDisini siap, agar fitur
// pembayaran tidak terlihat publik. Nyalakan lokal untuk tes.
export function isShopEnabled() {
  return String(process.env.NEXT_PUBLIC_SHOP_ENABLED || '').toLowerCase() === 'true';
}

export const XP_PACKS = [
  { id: 'xp-5k', priceIdr: 5000, xp: 6000 },
  { id: 'xp-10k', priceIdr: 10000, xp: 11500 },
  { id: 'xp-50k', priceIdr: 50000, xp: 55000 },
  { id: 'xp-100k', priceIdr: 100000, xp: 125000 },
];

export const SLOT_PRICE_IDR = 10000;
export const MAX_SLOTS_PER_USER = 50;
// Order pending yang tidak dibayar dalam 15 menit otomatis kadaluarsa.
// (QRIS asli: buka HP + scan + konfirmasi sering >5 menit.)
export const ORDER_PENDING_TTL_MS = 15 * 60 * 1000;
// Tiap slot = 1 kartu pajangan custom dengan 3x jatah ubah (tiap Simpan makan 1).
export const MAX_EDITS_PER_SLOT = 3;

export const SLOT_BORDER_TYPES = DISPLAY_BORDERS;

export function findPack(packId) {
  return XP_PACKS.find((p) => p.id === String(packId || '')) || null;
}

export function editsLeft(slot) {
  return Math.max(0, MAX_EDITS_PER_SLOT - (Number(slot?.edits_used) || 0));
}

// ---- PayDisini (https://payment.paydisini.co.id/docs) ----
// Satu endpoint untuk semua request; body form-urlencoded + signature md5.
// Channel default: 11 = QRIS Merchant PayDisini (fee 0.7%, min Rp100, maks Rp10jt).
const PAYDISINI_API_URL = 'https://api.paydisini.co.id/v1/';
export const PAYDISINI_DEFAULT_SERVICE = '11';

export function paydisiniApiKey() {
  return String(process.env.PAYDISINI_API_KEY || '').trim();
}

export function paydisiniServiceId() {
  return String(process.env.PAYDISINI_SERVICE || '').trim() || PAYDISINI_DEFAULT_SERVICE;
}

// 1 = fee ditanggung customer, 2 = fee ditanggung merchant (harga katalog tetap).
export function paydisiniTypeFee() {
  return String(process.env.PAYDISINI_TYPE_FEE || '').trim() === '1' ? '1' : '2';
}

export function isPaydisiniConfigured() {
  return Boolean(paydisiniApiKey());
}

function md5(s) {
  return createHash('md5').update(String(s)).digest('hex');
}

// valid_time PayDisini: 300-10800 detik; disamakan dengan TTL order.
export function paydisiniValidTimeSec() {
  const sec = Math.ceil(ORDER_PENDING_TTL_MS / 1000);
  return Math.min(10800, Math.max(300, sec));
}

async function paydisiniPost(params) {
  const res = await fetch(PAYDISINI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(String(data?.msg || `PayDisini ${res.status}`));
  }
  return data;
}

// Buat transaksi baru. Return data untuk ditampilkan (QR) + disimpan.
export async function createPaydisiniTransaction({ orderId, amount, note }) {
  const key = paydisiniApiKey();
  if (!key) throw new Error('PAYDISINI_API_KEY belum diisi');
  const code = String(orderId).slice(0, 32); // unique_code maks 32 karakter
  const service = paydisiniServiceId();
  const amountStr = String(Math.round(Number(amount) || 0));
  const validTime = String(paydisiniValidTimeSec());
  const signature = md5(`${key}${code}${service}${amountStr}${validTime}NewTransaction`);
  const data = await paydisiniPost({
    key,
    request: 'new',
    unique_code: code,
    service,
    amount: amountStr,
    note: String(note || 'Pembayaran Animein').slice(0, 250),
    valid_time: validTime,
    type_fee: paydisiniTypeFee(),
    callback_count: '3',
    signature,
  });
  const d = data.data || {};
  return {
    payId: String(d.pay_id || ''),
    qrContent: String(d.qr_content || ''),
    qrUrl: String(d.qrcode_url || ''),
    checkoutUrl: String(d.checkout_url_v3 || d.checkout_url_v2 || d.checkout_url || ''),
    channelName: String(d.service_name || '').trim(),
    status: String(d.status || 'Pending'),
  };
}

// Verifikasi signature callback: md5(key + unique_code + 'CallbackStatus'),
// plus pastikan `key` yang dikirim memang API key kita.
export function verifyPaydisiniCallbackSignature({ key, uniqueCode, signature }) {
  const apiKey = paydisiniApiKey();
  if (!apiKey) return false;
  if (String(key || '') !== apiKey) return false;
  const expected = md5(`${apiKey}${uniqueCode}CallbackStatus`);
  return expected === String(signature || '').toLowerCase();
}

// Ambil status transaksi langsung dari PayDisini (dipakai tombol "Cek Status"
// dan sinkronisasi otomatis — penting untuk localhost yang tak terjangkau callback).
export async function fetchPaydisiniStatus(uniqueCode) {
  const key = paydisiniApiKey();
  if (!key) throw new Error('PAYDISINI_API_KEY belum diisi');
  const code = String(uniqueCode);
  const signature = md5(`${key}${code}StatusTransaction`);
  return paydisiniPost({ key, request: 'status', unique_code: code, signature });
}

// Sinkronkan 1 order ke status PayDisini + penuhi bila lunas.
// Pemaaf: order 'expired' yang ternyata Success di PayDisini tetap dipenuhi
// (anti double-kirim: status langsung jadi 'paid', sync berikutnya diabaikan).
// Return { status: 'paid'|'pending'|'failed'|'expired'|'unknown', reason? }.
export async function syncOrderFromPaydisini(orderId) {
  const order = await getOrder(orderId);
  if (!order) return { status: 'unknown' };
  if (order.status !== 'pending' && order.status !== 'expired') return { status: order.status };
  // Order lama (era Midtrans) tidak punya transaksi di PayDisini.
  if (!order.payId && !order.qrUrl) return { status: order.status };
  const st = await fetchPaydisiniStatus(orderId);
  const status = String(st?.data?.status || '');
  const channel = String(st?.service?.name || st?.data?.service_name || '');
  if (status === 'Success') {
    const r = await fulfillPaidOrder(order, { paymentType: channel });
    if (!r.fulfilled && r.reason !== 'bukan pending/expired') return { status: order.status, reason: r.reason };
    return { status: 'paid' };
  }
  if (status === 'Canceled') {
    await setOrderStatus(orderId, 'failed');
    return { status: 'failed' };
  }
  if (status === 'Pending') return { status: 'pending' };
  return { status: order.status };
}

export function genMerchantOrderId() {
  const rand = 100000 + randomInt(900000);
  return `ANIMEIN-${Date.now()}-${rand}`;
}

export async function ensureShopTables() {
  if (isSchemaReady()) return; // DDL sudah diurus migrasi (0 round-trip).
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
      paid_at INTEGER DEFAULT 0,
      payment_type TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      pay_id TEXT DEFAULT '',
      qr_url TEXT DEFAULT '',
      qr_content TEXT DEFAULT '',
      checkout_url TEXT DEFAULT '',
      pay_channel TEXT DEFAULT ''
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_shop_orders_user ON shop_orders (user_id, created_at DESC)');
  // Kolom tambahan (best-effort untuk DB lama).
  try { await db.execute('ALTER TABLE shop_orders ADD COLUMN paid_at INTEGER DEFAULT 0'); } catch { /* sudah ada */ }
  try { await db.execute('ALTER TABLE shop_orders ADD COLUMN payment_type TEXT DEFAULT \'\''); } catch { /* sudah ada */ }
  try { await db.execute('ALTER TABLE shop_orders ADD COLUMN pay_id TEXT DEFAULT \'\''); } catch { /* sudah ada */ }
  try { await db.execute('ALTER TABLE shop_orders ADD COLUMN qr_url TEXT DEFAULT \'\''); } catch { /* sudah ada */ }
  try { await db.execute('ALTER TABLE shop_orders ADD COLUMN qr_content TEXT DEFAULT \'\''); } catch { /* sudah ada */ }
  try { await db.execute('ALTER TABLE shop_orders ADD COLUMN checkout_url TEXT DEFAULT \'\''); } catch { /* sudah ada */ }
  try { await db.execute('ALTER TABLE shop_orders ADD COLUMN pay_channel TEXT DEFAULT \'\''); } catch { /* sudah ada */ }
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
  // Deskripsi kartu custom (best-effort untuk DB lama).
  try { await db.execute('ALTER TABLE user_display_slots ADD COLUMN description TEXT DEFAULT \'\''); } catch { /* sudah ada */ }
}

export async function createOrder({ userId, username, kind, ref, qty, amountIdr, xpAmount, pay = {} }) {
  const db = getDb();
  await ensureShopTables();
  const orderId = genMerchantOrderId();
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO shop_orders (order_id, user_id, username, kind, ref, qty, amount_idr, xp_amount, status, pay_id, qr_url, qr_content, checkout_url, pay_channel, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
    args: [orderId, String(userId), String(username || ''), kind, String(ref || ''), Number(qty) || 1, amountIdr, xpAmount || 0,
      pay.payId || '', pay.qrUrl || '', pay.qrContent || '', pay.checkoutUrl || '', pay.channelName || '', now, now],
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
    payId: String(r.pay_id || ''),
    qrUrl: String(r.qr_url || ''),
    payChannel: String(r.pay_channel || ''),
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
    sql: 'SELECT order_id, kind, ref, qty, amount_idr, xp_amount, status, pay_id, qr_url, qr_content, checkout_url, pay_channel, paid_at, payment_type, created_at FROM shop_orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
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
    payId: String(r.pay_id || ''),
    qrUrl: String(r.qr_url || ''),
    qrContent: String(r.qr_content || ''),
    checkoutUrl: String(r.checkout_url || ''),
    payChannel: String(r.pay_channel || ''),
    paidAt: Number(r.paid_at) || 0,
    paymentType: String(r.payment_type || ''),
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

// Penuhi order yang sudah dibayar (idempoten).
// Menerima status 'pending' (normal) maupun 'expired' (rekonsiliasi: PayDisini
// bilang Success padahal lokal keburu kadaluarsa — uang sudah kepotong, jadi tetap dipenuhi).
// payment: { paymentType } dari PayDisini (nama channel, disimpan untuk detail transaksi).
// Return { fulfilled: true } atau { fulfilled: false, reason }.
export async function fulfillPaidOrder(order, payment = {}) {
  const db = getDb();
  await ensureShopTables();
  const fresh = await getOrder(order.orderId);
  if (!fresh || (fresh.status !== 'pending' && fresh.status !== 'expired')) {
    return { fulfilled: false, reason: 'bukan pending/expired' };
  }
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
  try {
    await db.execute({
      sql: 'UPDATE shop_orders SET paid_at = ?, payment_type = ? WHERE order_id = ?',
      args: [Date.now(), String(payment.paymentType || fresh.payChannel || 'QRIS'), fresh.orderId],
    });
  } catch { /* kolom lama: abaikan, status paid tetap sah */ }
  return { fulfilled: true };
}

export async function listUserSlots(userId) {
  await ensureShopTables();
  const res = await getDb().execute({
    sql: 'SELECT id, name, image_url, border_type, border_color, description, edits_used, created_at FROM user_display_slots WHERE user_id = ? ORDER BY id ASC',
    args: [String(userId)],
  });
  return (res.rows || []).map((r) => ({
    id: Number(r.id),
    name: String(r.name || 'Kartu Custom'),
    imageUrl: r.image_url || null,
    borderType: String(r.border_type || 'classic'),
    borderColor: String(r.border_color || ''),
    description: String(r.description || ''),
    editsUsed: Number(r.edits_used) || 0,
    editsLeft: editsLeft({ edits_used: r.edits_used }),
  }));
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
  const description = String(input.description || '').trim().slice(0, 280);
  await getDb().execute({
    sql: `UPDATE user_display_slots
          SET name = ?, image_url = ?, border_type = ?, border_color = ?, description = ?,
              edits_used = edits_used + 1, updated_at = ?
          WHERE id = ? AND user_id = ?`,
    args: [name, imageUrl || null, borderType, borderColor, description, Date.now(), Number(slotId), String(userId)],
  });
  return { ok: true, editsLeft: MAX_EDITS_PER_SLOT - used - 1 };
}
