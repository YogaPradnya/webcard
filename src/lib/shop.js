import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { getDb } from './db.js';
import { isSchemaReady } from './schema.js';
import { calcLevel } from './level.js';
import { cleanHex } from './color.js';
import { DISPLAY_BORDERS } from './constants.js';
import {
  XP_PACKS,
  SLOT_PRICE_IDR,
  MAX_SLOTS_PER_USER,
  MAX_EDITS_PER_SLOT,
} from './products.js';

// Katalog Shop KartuYogaa: Top-Up XP + Slot Kartu Pajangan custom.
// Harga dalam Rupiah, XP otomatis masuk setelah pembayaran sukses via Tripay.
// Konstanta produk ada di products.js agar landing page publik bisa memakainya
// tanpa menarik modul server/database.
export { XP_PACKS, SLOT_PRICE_IDR, MAX_SLOTS_PER_USER, MAX_EDITS_PER_SLOT };

// Feature flag checkout Shop. Katalog produk tetap bisa dilihat publik,
// tetapi tombol pembelian hanya aktif bila flag ini true dan Tripay siap.
// Matikan (default) sampai kredensial production Tripay siap.
// Nyalakan lokal untuk tes.
export function isShopEnabled() {
  return String(process.env.NEXT_PUBLIC_SHOP_ENABLED || '').toLowerCase() === 'true';
}

// Mode simulasi pembayaran: aktif di dev saat NEXT_PUBLIC_PAYMENT_SIMULATION=true
// Berguna saat API gateway pihak ketiga (Tripay) mengalami pemeliharaan.
export function isPaymentSimulationEnabled() {
  return String(process.env.NEXT_PUBLIC_PAYMENT_SIMULATION || '').toLowerCase() === 'true';
}

// Order pending yang tidak dibayar dalam 15 menit otomatis kadaluarsa.
// (QRIS asli: buka HP + scan + konfirmasi sering >5 menit.)
export const ORDER_PENDING_TTL_MS = 15 * 60 * 1000;
// Tiap slot = 1 kartu pajangan custom dengan 3x jatah ubah (tiap Simpan makan 1).

export const SLOT_BORDER_TYPES = DISPLAY_BORDERS;

export function findPack(packId) {
  return XP_PACKS.find((p) => p.id === String(packId || '')) || null;
}

export function editsLeft(slot) {
  return Math.max(0, MAX_EDITS_PER_SLOT - (Number(slot?.edits_used) || 0));
}

// ---- Tripay (https://tripay.co.id/developer) ----
// Closed payment QRIS. Signature create:
// HMAC-SHA256(merchant_code + merchant_ref + amount, private_key).
// Signature callback: HMAC-SHA256(raw JSON body, private_key).
const TRIPAY_API_PRODUCTION = 'https://tripay.co.id/api/';
const TRIPAY_API_SANDBOX = 'https://tripay.co.id/api-sandbox/';
export const TRIPAY_DEFAULT_CHANNEL = 'QRIS';
export const TRIPAY_DEFAULT_CALLBACK_URL = 'https://kartu.yogaa.web.id/api/shop/webhook';
export const TRIPAY_DEFAULT_RETURN_URL = 'https://kartu.yogaa.web.id/shop';

export function tripayMode() {
  return String(process.env.TRIPAY_MODE || 'production').trim().toLowerCase() === 'sandbox'
    ? 'sandbox'
    : 'production';
}

export function tripayApiBase() {
  return tripayMode() === 'sandbox' ? TRIPAY_API_SANDBOX : TRIPAY_API_PRODUCTION;
}

export function tripayMerchantCode() {
  return String(process.env.TRIPAY_MERCHANT_CODE || '').trim();
}

export function tripayApiKey() {
  return String(process.env.TRIPAY_API_KEY || '').trim();
}

export function tripayPrivateKey() {
  return String(process.env.TRIPAY_PRIVATE_KEY || '').trim();
}

export function tripayChannel() {
  return String(process.env.TRIPAY_CHANNEL || '').trim() || TRIPAY_DEFAULT_CHANNEL;
}

export function tripayCallbackUrl() {
  return String(process.env.TRIPAY_CALLBACK_URL || '').trim() || TRIPAY_DEFAULT_CALLBACK_URL;
}

export function tripayReturnUrl() {
  return String(process.env.TRIPAY_RETURN_URL || '').trim() || TRIPAY_DEFAULT_RETURN_URL;
}

export function isTripayConfigured() {
  return Boolean(tripayMerchantCode() && tripayApiKey() && tripayPrivateKey());
}

export function tripayChannelName(raw) {
  const s = String(raw || '').trim();
  return s || TRIPAY_DEFAULT_CHANNEL;
}

// Signature request create transaksi (bukan signature callback).
export function tripayCreateSignature({ merchantCode, merchantRef, amount, privateKey }) {
  return createHmac('sha256', String(privateKey || ''))
    .update(`${merchantCode}${merchantRef}${Math.round(Number(amount) || 0)}`)
    .digest('hex');
}

// Buat transaksi QRIS baru. Return data untuk ditampilkan (QR) + disimpan.
export async function createTripayTransaction({
  orderId, amount, customerName, customerEmail, customerPhone, itemName,
}) {
  const merchantCode = tripayMerchantCode();
  const apiKey = tripayApiKey();
  const privateKey = tripayPrivateKey();
  if (!merchantCode || !apiKey || !privateKey) {
    throw new Error('TRIPAY_MERCHANT_CODE/TRIPAY_API_KEY/TRIPAY_PRIVATE_KEY belum diisi');
  }
  const merchantRef = String(orderId);
  const amountInt = Math.round(Number(amount) || 0);
  if (amountInt < 1) throw new Error('Nominal tidak valid');
  const method = tripayChannel();
  const signature = tripayCreateSignature({
    merchantCode, merchantRef, amount: amountInt, privateKey,
  });

  // Tripay menerima application/x-www-form-urlencoded (contoh resmi).
  const form = new URLSearchParams();
  form.set('method', method);
  form.set('merchant_ref', merchantRef);
  form.set('amount', String(amountInt));
  form.set('customer_name', customerName || 'KartuYogaa User');
  form.set('customer_email', customerEmail || 'noreply@kartu.yogaa.web.id');
  if (customerPhone) form.set('customer_phone', String(customerPhone));
  form.set('order_items[0][name]', itemName || 'Pembelian KartuYogaa');
  form.set('order_items[0][price]', String(amountInt));
  form.set('order_items[0][quantity]', '1');
  form.set('callback_url', tripayCallbackUrl());
  form.set('return_url', tripayReturnUrl());
  form.set('expired_time', String(Math.floor((Date.now() + ORDER_PENDING_TTL_MS) / 1000)));
  form.set('signature', signature);

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 10000);

  let res;
  try {
    res = await fetch(`${tripayApiBase()}transaction/create`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form,
      cache: 'no-store',
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Tripay tidak merespons dalam 10 detik (timeout)');
    }
    throw new Error(`Tripay tidak bisa dihubungi: ${e.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success !== true) {
    const errMsg = String(data?.message || `Tripay ${res.status}`);
    throw new Error(`Tripay: ${errMsg}`);
  }
  const d = data.data || {};
  const qrContent = String(d.qr_string || d.pay_code || '');
  const qrUrl = String(d.qr_url || '');
  const checkoutUrl = String(d.checkout_url || d.pay_url || '');
  if (!d.reference) throw new Error('Tripay tidak mengembalikan referensi transaksi');
  if (!qrContent && !qrUrl && !checkoutUrl) {
    throw new Error('Tripay tidak mengembalikan data QR');
  }
  return {
    payId: String(d.reference),
    qrContent,
    qrUrl,
    checkoutUrl,
    channelName: tripayChannelName(d.payment_name || d.payment_method || method),
    status: String(d.status || 'UNPAID'),
  };
}

// Buat transaksi simulasi untuk pengujian lokal saat gateway tidak tersedia
export function createSimulatedTransaction({ orderId, amount }) {
  const refId = String(orderId);
  const amountInt = Math.round(Number(amount) || 0);
  return {
    payId: `SIM-${Date.now()}`,
    qrContent: `00020101021226590014ID.LINKAJA.WWW01189360091100222033880215${refId}520458125303360540${amountInt}5802ID5910KartuYogaa SHOP6007JAKARTA6304ABCD`,
    qrUrl: `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=KartuYogaa_SIMULATION_${encodeURIComponent(refId)}`,
    checkoutUrl: '',
    channelName: 'QRIS (Simulasi Dev)',
    status: 'Pending',
  };
}

// Verifikasi signature callback Tripay. Wajib memakai raw body persis seperti
// yang diterima (bukan JSON.stringify ulang) agar HMAC tetap cocok.
export function verifyTripayCallbackSignature({ rawBody, signature }) {
  const privateKey = tripayPrivateKey();
  if (!privateKey || !rawBody || !signature) return false;
  const expected = createHmac('sha256', privateKey).update(String(rawBody)).digest('hex');
  const given = String(signature).trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(given) || given.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(given, 'hex'));
  } catch {
    return false;
  }
}

// Status callback/check transaksi Tripay -> status internal.
export function mapTripayStatus(status) {
  const s = String(status || '').trim().toUpperCase();
  if (s === 'PAID') return 'paid';
  if (s === 'UNPAID' || s === 'PENDING') return 'pending';
  if (s === 'FAILED') return 'failed';
  if (s === 'EXPIRED') return 'expired';
  if (s === 'REFUND') return 'refund';
  return 'unknown';
}

// Ambil detail transaksi Tripay berdasarkan reference (dipakai tombol
// "Cek Status" + sinkronisasi otomatis). Reference disimpan di kolom pay_id.
export async function fetchTripayTransaction(reference) {
  const apiKey = tripayApiKey();
  if (!apiKey) throw new Error('TRIPAY_API_KEY belum diisi');
  const ref = String(reference || '').trim();
  if (!ref) return { found: false, data: null, reason: 'reference kosong' };

  const url = new URL('transaction/detail', tripayApiBase());
  url.searchParams.set('reference', ref);

  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 8000);

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: ctrl.signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('Tripay tidak merespons dalam 8 detik (timeout)');
    }
    throw new Error(`Tripay tidak bisa dihubungi: ${e.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = String(data?.message || `Tripay ${res.status}`);
    if (/not found|tidak ditemukan/i.test(msg)) return { found: false, data: null, reason: msg };
    throw new Error(`Tripay: ${msg}`);
  }
  if (data.success !== true) {
    const msg = String(data?.message || 'Data tidak ditemukan');
    // Order lama/non-Tripay: jangan dianggap error keras.
    if (/not found|tidak ditemukan/i.test(msg)) return { found: false, data: null, reason: msg };
    throw new Error(`Tripay: ${msg}`);
  }
  if (!data.data) return { found: false, data: null, reason: 'Data kosong' };
  return { found: true, data: data.data };
}

// Sinkronkan 1 order ke status Tripay + penuhi bila lunas.
// Pemaaf: order 'expired' yang ternyata PAID di Tripay tetap dipenuhi
// (anti double-kirim: status langsung jadi 'paid', sync berikutnya diabaikan).
// Return { status: 'paid'|'pending'|'failed'|'expired'|'refund'|'unknown', reason? }.
export async function syncOrderFromTripay(orderId) {
  const order = await getOrder(orderId);
  if (!order) return { status: 'unknown' };
  if (order.status !== 'pending' && order.status !== 'expired') return { status: order.status };
  // Order simulasi tidak dikirim ke Tripay, bayar lewat tombol simulasi.
  if (order.payChannel?.includes('Simulasi') || order.payId?.startsWith('SIM-')) {
    return { status: order.status, reason: 'Order simulasi dev — gunakan tombol Bayar Instan' };
  }
  if (!order.payId) return { status: order.status, reason: 'reference Tripay belum tersimpan' };

  const st = await fetchTripayTransaction(order.payId);
  if (!st.found) return { status: order.status, reason: st.reason || 'tidak ditemukan' };
  const d = st.data;
  if (d.merchant_ref && String(d.merchant_ref) !== String(orderId)) {
    console.warn('[SHOP SYNC] merchant_ref tidak cocok:', orderId, d.merchant_ref);
    return { status: order.status, reason: 'merchant_ref tidak cocok' };
  }
  const mapped = mapTripayStatus(d.status);
  const channel = tripayChannelName(
    d.payment_name || d.payment_method || d.payment_method_code || order.payChannel,
  );
  if (mapped === 'paid') {
    // Callback/detail bisa memuat total_amount (termasuk fee customer).
    // Bandingkan dengan harga dasar order, bukan amount_received (setelah fee merchant).
    const paid = Number(d.total_amount ?? d.amount ?? 0) || 0;
    if (paid > 0 && paid < Number(order.amountIdr)) {
      console.warn('[SHOP SYNC] Nominal kurang:', orderId, paid, order.amountIdr);
      return { status: order.status, reason: 'nominal kurang' };
    }
    const r = await fulfillPaidOrder(order, { paymentType: channel });
    if (r.fulfilled || r.alreadyPaid) return { status: 'paid' };
    return { status: r.reason === 'sedang diproses' ? 'processing' : order.status, reason: r.reason };
  }
  if (mapped === 'failed') {
    await transitionOrderStatus(orderId, 'failed', ['pending', 'expired']);
    return { status: 'failed' };
  }
  if (mapped === 'expired') {
    await transitionOrderStatus(orderId, 'expired', ['pending']);
    return { status: 'expired' };
  }
  if (mapped === 'refund') {
    if (order.status !== 'refund') await setOrderStatus(orderId, 'refund');
    return { status: 'refund' };
  }
  return { status: mapped === 'pending' ? 'pending' : order.status };
}

export function genMerchantOrderId() {
  const rand = 100000 + randomInt(900000);
  return `KartuYogaa-${Date.now()}-${rand}`;
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

// Buat baris order pending LEBIH DULU, sebelum memanggil Tripay.
// Ini menutup race callback-vs-insert: callback yang datang cepat selalu
// menemukan order di DB, jadi pembayaran tidak pernah "hilang" hanya karena
// baris order belum sempat dibuat.
export async function createPendingOrder({ orderId, userId, username, kind, ref, qty, amountIdr, xpAmount }) {
  await ensureShopTables();
  const db = getDb();
  const id = String(orderId || genMerchantOrderId());
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO shop_orders (order_id, user_id, username, kind, ref, qty, amount_idr, xp_amount, status, pay_id, qr_url, qr_content, checkout_url, pay_channel, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', '', '', '', '', ?, ?)`,
    args: [id, String(userId), String(username || ''), String(kind), String(ref || ''), Number(qty) || 1,
      Number(amountIdr) || 0, Number(xpAmount) || 0, now, now],
  });
  return id;
}

// Simpan data pembayaran (reference/QR) setelah transaksi Tripay dibuat.
export async function setOrderPayment(orderId, pay = {}) {
  await getDb().execute({
    sql: `UPDATE shop_orders
          SET pay_id = ?, qr_url = ?, qr_content = ?, checkout_url = ?, pay_channel = ?, updated_at = ?
          WHERE order_id = ?`,
    args: [String(pay.payId || ''), String(pay.qrUrl || ''), String(pay.qrContent || ''),
      String(pay.checkoutUrl || ''), String(pay.channelName || ''), Date.now(), String(orderId)],
  });
}

// API lama: buat order + data pembayaran dalam satu panggilan.
export async function createOrder({ userId, username, kind, ref, qty, amountIdr, xpAmount, pay = {} }) {
  const orderId = genMerchantOrderId();
  await createPendingOrder({ orderId, userId, username, kind, ref, qty, amountIdr, xpAmount });
  if (pay && Object.keys(pay).length > 0) await setOrderPayment(orderId, pay);
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

// Transisi status yang aman dari race: hanya ubah bila status saat ini masih
// salah satu dari `allowed`. Dipakai untuk failed/expired agar callback PAID
// yang menang balapan tidak ditimpa kembali menjadi gagal/kadaluarsa.
export async function transitionOrderStatus(orderId, status, allowed = []) {
  const from = (Array.isArray(allowed) ? allowed : []).map(String);
  if (from.length === 0) return 0;
  const placeholders = from.map(() => '?').join(', ');
  const res = await getDb().execute({
    sql: `UPDATE shop_orders SET status = ?, updated_at = ? WHERE order_id = ? AND status IN (${placeholders})`,
    args: [String(status), Date.now(), String(orderId), ...from],
  });
  return Number(res.rowsAffected || 0);
}

// Tandai pending yang lebih tua dari TTL sebagai expired. Return jumlah yang diubah.
// Catatan: GET /api/shop/orders TIDAK memanggil ini lagi (GET murni baca);
// listUserOrders menampilkan status expired secara efektif. Fungsi ini
// disediakan untuk cron/admin/backfill bila ingin merapikan status di DB.
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
  const now = Date.now();
  return (res.rows || []).map((r) => {
    const createdAt = Number(r.created_at) || 0;
    let status = String(r.status);
    // GET order tidak boleh menulis ke DB. Tampilkan pending lama sebagai
    // expired secara efektif; callback PAID tetap boleh memenuhinya.
    if (status === 'pending' && createdAt > 0 && createdAt < now - ORDER_PENDING_TTL_MS) {
      status = 'expired';
    }
    return {
      orderId: String(r.order_id),
      kind: String(r.kind),
      ref: String(r.ref || ''),
      qty: Number(r.qty) || 1,
      amountIdr: Number(r.amount_idr) || 0,
      xpAmount: Number(r.xp_amount) || 0,
      status,
      payId: String(r.pay_id || ''),
      qrUrl: String(r.qr_url || ''),
      qrContent: String(r.qr_content || ''),
      checkoutUrl: String(r.checkout_url || ''),
      payChannel: String(r.pay_channel || ''),
      paidAt: Number(r.paid_at) || 0,
      paymentType: String(r.payment_type || ''),
      createdAt,
    };
  });
}

// Tambah XP secara ATOMIC (xp = xp + delta), bukan baca-lalu-tulis.
// Ini mencegah top-up web menimpa XP yang baru ditambahkan bot / request lain.
async function addXpToUser(userId, username, amount) {
  const db = getDb();
  const delta = Math.round(Number(amount) || 0);
  const res = await db.execute({
    sql: `INSERT INTO user_stats (user_id, username, xp, level)
          VALUES (?, ?, MAX(0, ?), ?)
          ON CONFLICT(user_id) DO UPDATE SET
            xp = MAX(0, user_stats.xp + ?),
            username = excluded.username
          RETURNING xp`,
    args: [String(userId), String(username || ''), delta, calcLevel(Math.max(0, delta)), delta],
  });
  const newXp = Number(res.rows?.[0]?.xp) || 0;
  await db.execute({
    sql: 'UPDATE user_stats SET level = ? WHERE user_id = ?',
    args: [calcLevel(newXp), String(userId)],
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
// Menerima status 'pending' (normal) maupun 'expired' (rekonsiliasi: Tripay
// bilang PAID padahal lokal keburu kadaluarsa — uang sudah kepotong, jadi tetap dipenuhi).
// payment: { paymentType } dari Tripay (nama channel, disimpan untuk detail transaksi).
// Return { fulfilled: true, alreadyPaid? } atau { fulfilled: false, reason }.
function claimRelease(db, orderId, status) {
  return db.execute({
    sql: `UPDATE shop_orders SET status = ?, updated_at = ?
          WHERE order_id = ? AND status = 'processing'`,
    args: [String(status || 'pending'), Date.now(), String(orderId)],
  }).catch(() => {});
}

export async function fulfillPaidOrder(order, payment = {}) {
  const db = getDb();
  await ensureShopTables();
  const orderId = String(order?.orderId || '');
  if (!orderId) return { fulfilled: false, reason: 'order tidak valid' };

  const fresh = await getOrder(orderId);
  if (!fresh) return { fulfilled: false, reason: 'order tidak ditemukan' };
  if (fresh.status === 'paid') return { fulfilled: true, alreadyPaid: true };
  if (fresh.status !== 'pending' && fresh.status !== 'expired') {
    return {
      fulfilled: false,
      reason: fresh.status === 'processing' ? 'sedang diproses' : 'bukan pending/expired',
    };
  }

  // KLAIM ATOMIK: hanya satu pemanggil (callback / auto-check / simulasi)
  // yang boleh memproses order ini. Yang kalah balapan tidak menyentuh XP.
  const claimed = await transitionOrderStatus(orderId, 'processing', ['pending', 'expired']);
  if (claimed !== 1) {
    const latest = await getOrder(orderId);
    if (latest?.status === 'paid') return { fulfilled: true, alreadyPaid: true };
    return {
      fulfilled: false,
      reason: latest?.status === 'processing' ? 'sedang diproses' : 'bukan pending/expired',
    };
  }

  let bonus = null;
  if (fresh.kind === 'xp') {
    try {
      await addXpToUser(fresh.userId, fresh.username, fresh.xpAmount);
    } catch (e) {
      // Belum ada efek samping yang dikonfirmasi: lepas klaim agar callback
      // Tripay / Cek Status bisa mencoba lagi.
      await claimRelease(db, orderId, fresh.status);
      return { fulfilled: false, reason: `gagal tambah XP: ${e.message}` };
    }

    // Bonus kartu mengikuti paket yang dibeli. Kegagalan bonus TIDAK boleh
    // menggagalkan XP (produk utama sudah masuk); kartu bonus ditulis dalam
    // satu statement agar tidak butuh transaction() di request path.
    const bonusCards = findPack(fresh.ref)?.bonusCards;
    if (bonusCards && Object.keys(bonusCards).length > 0) {
      try {
        const { grantCardBonus } = await import('./gacha.js');
        bonus = await grantCardBonus(fresh.userId, fresh.username, bonusCards);
        const requested = Object.values(bonusCards)
          .reduce((sum, n) => sum + Math.max(0, Math.floor(Number(n) || 0)), 0);
        if ((bonus?.granted?.length || 0) < requested) {
          console.warn(
            '[SHOP FULFILL] Bonus kartu tidak lengkap:',
            orderId,
            `${bonus?.granted?.length || 0}/${requested}`,
          );
        }
      } catch (e) {
        console.error('[SHOP FULFILL] Gagal bonus kartu:', orderId, e.message);
      }
    }
  } else if (fresh.kind === 'slot') {
    const have = await countUserSlots(fresh.userId);
    const room = Math.max(0, MAX_SLOTS_PER_USER - have);
    if (room < fresh.qty) {
      await claimRelease(db, orderId, fresh.status);
      return { fulfilled: false, reason: 'slot penuh (maks 50)' };
    }
    const now = Date.now();
    let granted = 0;
    try {
      for (let i = 0; i < fresh.qty; i++) {
        await db.execute({
          sql: `INSERT INTO user_display_slots (user_id, username, name, created_at, updated_at)
                VALUES (?, ?, 'Kartu Custom', ?, ?)`,
          args: [fresh.userId, fresh.username, now, now],
        });
        granted++;
      }
    } catch (e) {
      // Sebagian slot sudah masuk: jangan lepas klaim (bisa dobel saat retry).
      if (granted === 0) await claimRelease(db, orderId, fresh.status);
      return { fulfilled: false, reason: `gagal tambah slot: ${e.message}` };
    }
  } else {
    await claimRelease(db, orderId, fresh.status);
    return { fulfilled: false, reason: 'jenis tak dikenal' };
  }

  // Finalisasi status + paid_at + payment_type dalam SATU statement.
  // Bila ini gagal setelah XP/slot masuk, JANGAN lepas klaim: retry akan
  // menggandakan hadiah. Biarkan 'processing' untuk rekonsiliasi admin.
  const paidAt = Date.now();
  const paymentType = String(payment.paymentType || fresh.payChannel || 'QRIS');
  try {
    await db.execute({
      sql: `UPDATE shop_orders
            SET status = 'paid', paid_at = ?, payment_type = ?, updated_at = ?
            WHERE order_id = ?`,
      args: [paidAt, paymentType, paidAt, orderId],
    });
  } catch (e) {
    console.error('[SHOP FULFILL] Gagal finalisasi status paid:', orderId, e.message);
    return { fulfilled: false, reason: 'hadiah sudah masuk, gagal menandai lunas' };
  }

  // Misi mingguan "Top-Up 1x" hanya dihitung setelah order benar-benar paid.
  // recordEvent menelan error sendiri; jangan sampai menggagalkan pembayaran.
  if (fresh.kind === 'xp') {
    try {
      const { recordEvent } = await import('./missions.js');
      await recordEvent(fresh.userId, fresh.username, 'topup', 1);
    } catch { /* misi non-kritis */ }
  }

  return { fulfilled: true, alreadyPaid: false, bonus };
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
  if (!res.fulfilled && !res.alreadyPaid) {
    throw new Error(res.reason || 'Gagal memenuhi order');
  }
  return { status: 'paid', fulfilled: true, alreadyPaid: Boolean(res.alreadyPaid) };
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
