import { createHash, randomInt } from 'node:crypto';
import { getDb } from './db.js';
import { isSchemaReady } from './schema.js';
import { calcLevel } from './level.js';
import { cleanHex } from './color.js';
import { DISPLAY_BORDERS } from './constants.js';

// Katalog Shop Animein: Top-Up XP + Slot Kartu Pajangan custom.
// Harga dalam Rupiah, XP otomatis masuk setelah pembayaran sukses via Tokopay.

// Feature flag Shop: tampil hanya bila NEXT_PUBLIC_SHOP_ENABLED=true.
// Matikan (default) sampai kredensial production Tokopay siap, agar fitur
// pembayaran tidak terlihat publik. Nyalakan lokal untuk tes.
export function isShopEnabled() {
  return String(process.env.NEXT_PUBLIC_SHOP_ENABLED || '').toLowerCase() === 'true';
}

// Mode simulasi pembayaran: aktif di dev saat NEXT_PUBLIC_PAYMENT_SIMULATION=true
// Berguna saat API gateway pihak ketiga (Tokopay) mengalami pemeliharaan.
export function isPaymentSimulationEnabled() {
  return String(process.env.NEXT_PUBLIC_PAYMENT_SIMULATION || '').toLowerCase() === 'true';
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

// ---- Tokopay (https://docs.tokopay.id) ----
// Order via POST JSON; signature md5(merchant_id:secret:reff_id) untuk
// create & callback. Channel default: QRIS (QRISREALTIME bisa lewat env).
const TOKOPAY_API_URL = 'https://api.tokopay.id/v1/';
export const TOKOPAY_DEFAULT_CHANNEL = 'QRIS';

export function tokopayMerchantId() {
  return String(process.env.TOKOPAY_MERCHANT_ID || '').trim();
}

export function tokopaySecret() {
  return String(process.env.TOKOPAY_SECRET || '').trim();
}

export function tokopayChannel() {
  return String(process.env.TOKOPAY_CHANNEL || '').trim() || TOKOPAY_DEFAULT_CHANNEL;
}

export function isTokopayConfigured() {
  return Boolean(tokopayMerchantId() && tokopaySecret());
}

function md5(s) {
  return createHash('md5').update(String(s)).digest('hex');
}

function isTokopaySuccess(status) {
  const s = String(status ?? '').trim().toLowerCase();
  return s === 'success' || s === '1' || s === 'true';
}

export function tokopayChannelName(raw) {
  const s = String(raw || '').trim();
  const upper = s.toUpperCase();
  if (upper === 'QRISREALTIME') return 'QRIS Realtime';
  if (upper === 'QRIS_REALTIME_NOBU') return 'QRIS Realtime Nobu';
  if (upper.startsWith('QRIS')) return 'QRIS';
  return s || 'QRIS';
}

function tokopaySignature(refId) {
  return md5(`${tokopayMerchantId()}:${tokopaySecret()}:${String(refId)}`);
}

// Buat transaksi QRIS baru. Return data untuk ditampilkan (QR) + disimpan.
export async function createTokopayTransaction({
  orderId, amount, customerName, customerEmail, customerPhone, itemName,
}) {
  const merchantId = tokopayMerchantId();
  const secret = tokopaySecret();
  if (!merchantId || !secret) {
    throw new Error('TOKOPAY_MERCHANT_ID/TOKOPAY_SECRET belum diisi');
  }
  const refId = String(orderId);
  const amountInt = Math.round(Number(amount) || 0);
  if (amountInt < 1) throw new Error('Nominal tidak valid');
  const channel = tokopayChannel();

  // Simple Order (GET) adalah metode utama sesuai dokumentasi Tokopay untuk QRIS
  const simpleUrl = new URL('order', TOKOPAY_API_URL);
  simpleUrl.searchParams.set('merchant', merchantId);
  simpleUrl.searchParams.set('secret', secret);
  simpleUrl.searchParams.set('ref_id', refId);
  simpleUrl.searchParams.set('nominal', String(amountInt));
  simpleUrl.searchParams.set('metode', channel);

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 8000);

  let res;
  try {
    res = await fetch(simpleUrl.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Tokopay tidak merespons dalam 8 detik (timeout)');
    }
    throw new Error(`Tokopay tidak bisa dihubungi: ${e.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !isTokopaySuccess(data.status)) {
    const errMsg = String(data?.error_msg || data?.message || `Tokopay ${res.status}`);
    throw new Error(`Tokopay: ${errMsg}`);
  }
  const d = data.data || {};
  if (!d.qr_link && !d.pay_url && !d.checkout_url) {
    throw new Error('Tokopay tidak mengembalikan data QR');
  }
  return {
    payId: String(d.trx_id || ''),
    qrContent: String(d.qr_string || ''),
    qrUrl: String(d.qr_link || ''),
    checkoutUrl: String(d.pay_url || d.checkout_url || ''),
    channelName: tokopayChannelName(channel),
    status: 'Pending',
  };
}

// Buat transaksi simulasi untuk pengujian lokal saat gateway tidak tersedia
export function createSimulatedTransaction({ orderId, amount }) {
  const refId = String(orderId);
  const amountInt = Math.round(Number(amount) || 0);
  return {
    payId: `SIM-${Date.now()}`,
    qrContent: `00020101021226590014ID.LINKAJA.WWW01189360091100222033880215${refId}520458125303360540${amountInt}5802ID5911ANIMEIN SHOP6007JAKARTA6304ABCD`,
    qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=ANIMEIN_SIMULATION_${encodeURIComponent(refId)}`,
    checkoutUrl: '',
    channelName: 'QRIS (Simulasi Dev)',
    status: 'Pending',
  };
}

// Verifikasi callback: merchant_id harus milik kita + signature
// md5(merchant_id:secret:reff_id). Signature Tokopay huruf kecil.
export function verifyTokopayCallbackSignature({ merchantId, refId, signature }) {
  const expectedMerchant = tokopayMerchantId();
  const secret = tokopaySecret();
  if (!expectedMerchant || !secret || !refId) return false;
  if (String(merchantId || '') !== expectedMerchant) return false;
  const expected = md5(`${expectedMerchant}:${secret}:${String(refId)}`);
  return expected === String(signature || '').toLowerCase();
}

// Status callback/check-order Tokopay -> status internal.
export function mapTokopayStatus(status) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'success' || s === 'completed') return 'paid';
  if (s === 'failed') return 'failed';
  if (s === 'unpaid' || s === 'proses callback' || s === 'pending') return 'pending';
  return 'unknown';
}

// Ambil status transaksi langsung dari Tokopay (dipakai tombol "Cek Status"
// dan sinkronisasi otomatis — penting untuk localhost yang tak terjangkau callback).
export async function fetchTokopayStatus(refId) {
  const merchantId = tokopayMerchantId();
  const secret = tokopaySecret();
  if (!merchantId || !secret) {
    throw new Error('TOKOPAY_MERCHANT_ID/TOKOPAY_SECRET belum diisi');
  }
  const url = new URL('check-order', TOKOPAY_API_URL);
  url.searchParams.set('merchant_id', merchantId);
  url.searchParams.set('secret', secret);
  url.searchParams.set('ref_id', String(refId));

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 7000);

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Tokopay tidak merespons dalam 7 detik (timeout)');
    }
    throw new Error(`Tokopay tidak bisa dihubungi: ${e.message}`);
  } finally {
    clearTimeout(timeoutId);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Tokopay ${res.status}`);
  if (!isTokopaySuccess(data.status)) {
    const msg = String(data?.error_msg || data?.message || 'Data Not Found');
    // Transaksi lama/non-Tokopay: jangan dianggap error keras.
    if (/not found|tidak ditemukan/i.test(msg)) return { found: false, data: null, reason: msg };
    throw new Error(msg);
  }
  if (!data.data) return { found: false, data: null, reason: 'Data kosong' };
  return { found: true, data: data.data };
}

// Sinkronkan 1 order ke status Tokopay + penuhi bila lunas.
// Pemaaf: order 'expired' yang ternyata Success di Tokopay tetap dipenuhi
// (anti double-kirim: status langsung jadi 'paid', sync berikutnya diabaikan).
// Return { status: 'paid'|'pending'|'failed'|'expired'|'unknown', reason? }.
export async function syncOrderFromTokopay(orderId) {
  const order = await getOrder(orderId);
  if (!order) return { status: 'unknown' };
  if (order.status !== 'pending' && order.status !== 'expired') return { status: order.status };
  // Order simulasi tidak dikirim ke Tokopay, bayar lewat tombol simulasi
  if (order.payChannel?.includes('Simulasi') || order.payId?.startsWith('SIM-')) {
    return { status: order.status, reason: 'Order simulasi dev — gunakan tombol Bayar Instan' };
  }
  const st = await fetchTokopayStatus(orderId);
  if (!st.found) return { status: order.status, reason: st.reason || 'tidak ditemukan' };
  const d = st.data;
  const mapped = mapTokopayStatus(d.status);
  const channel = tokopayChannelName(
    d.nama_payment_channel || d.nama_channel || d.kode_channel || order.payChannel || 'QRIS',
  );
  if (mapped === 'paid') {
    // Callback/check-order tidak menandatangani nominal, jadi pastikan cukup.
    const paid = Number(d.jumlah_bayar ?? d.nominal ?? 0) || 0;
    if (paid > 0 && paid < Number(order.amountIdr)) {
      console.warn('[SHOP SYNC] Nominal kurang:', orderId, paid, order.amountIdr);
      return { status: order.status, reason: 'nominal kurang' };
    }
    const r = await fulfillPaidOrder(order, { paymentType: channel });
    if (!r.fulfilled && r.reason !== 'bukan pending/expired') {
      return { status: order.status, reason: r.reason };
    }
    return { status: 'paid' };
  }
  if (mapped === 'failed') {
    if (order.status === 'pending') await setOrderStatus(orderId, 'failed');
    return { status: 'failed' };
  }
  return { status: mapped === 'pending' ? 'pending' : order.status };
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
// Menerima status 'pending' (normal) maupun 'expired' (rekonsiliasi: Tokopay
// bilang Success padahal lokal keburu kadaluarsa — uang sudah kepotong, jadi tetap dipenuhi).
// payment: { paymentType } dari Tokopay (nama channel, disimpan untuk detail transaksi).
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

// Eksekusi pembayaran simulasi (hanya berlaku bila mode simulasi aktif)
export async function simulateOrderPayment(orderId, userId) {
  if (!isPaymentSimulationEnabled()) {
    throw new Error('Mode simulasi tidak diaktifkan');
  }
  const order = await getOrder(orderId);
  if (!order) throw new Error('Order tidak ditemukan');
  if (userId && String(order.userId) !== String(userId)) {
    throw new Error('Akses tidak diizinkan');
  }
  if (order.status === 'paid') {
    return { status: 'paid', alreadyPaid: true };
  }
  const res = await fulfillPaidOrder(order, { paymentType: 'QRIS (Simulasi Dev)' });
  if (!res.fulfilled && res.reason !== 'bukan pending/expired') {
    throw new Error(res.reason || 'Gagal memenuhi order');
  }
  return { status: 'paid', fulfilled: true };
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
