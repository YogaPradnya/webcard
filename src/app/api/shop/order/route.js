import { getDb } from '@/lib/db';
import { checkRateCount } from '@/lib/rateLimit';
import {
  SLOT_PRICE_IDR, MAX_SLOTS_PER_USER, findPack, genMerchantOrderId,
  createTripayTransaction, createSimulatedTransaction, countUserSlots,
  ensureShopTables, isShopEnabled, isTripayConfigured, isPaymentSimulationEnabled,
} from '@/lib/shop';
import { countDisplayCards } from '@/lib/display';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';
import { getIdempotencyKey, ensureIdempotencyTable, checkIdempotency, saveIdempotency } from '@/lib/idempotency';
import { NextResponse } from 'next/server';

// POST /api/shop/order { kind: 'xp', packId } | { kind: 'slot', qty }
// Return { orderId, qrUrl, qrContent, checkoutUrl, qrChannel } untuk QRIS.
async function POST_impl(req, _ctx, session) {
  if (!isShopEnabled()) {
    return jsonFail('Shop belum dibuka.', 403);
  }
  if (!isTripayConfigured() && !isPaymentSimulationEnabled()) {
    return jsonFail('Pembayaran belum dikonfigurasi. Hubungi admin.', 503);
  }
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const kind = String(body.kind || '');
  const attempt = await checkRateCount(`shoporder:${session.id}`, 10, 60 * 1000);
  if (!attempt.ok) {
    return jsonFail('Terlalu sering bikin order. Tunggu sebentar.', 429);
  }
  try {
    // Paralel: kedua ensure independen, bisa jalan bersamaan.
    await Promise.all([ensureShopTables(), ensureIdempotencyTable()]);
    const db = getDb();
    const idemKey = getIdempotencyKey(req);
    if (idemKey) {
      const replay = await checkIdempotency(db, idemKey, session.id, 'shop/order');
      if (replay.hit) return NextResponse.json(replay.body, { status: replay.status });
    }
    let amountIdr = 0;
    let xpAmount = 0;
    let qty = 1;
    let ref = '';
    let itemName = '';
    if (kind === 'xp') {
      const pack = findPack(body.packId);
      if (!pack) return jsonFail('Paket tidak dikenal.', 400);
      amountIdr = pack.priceIdr;
      xpAmount = pack.xp;
      ref = pack.id;
      itemName = `Top-Up ${xpAmount.toLocaleString('id-ID')} XP KartuYogaa`;
    } else if (kind === 'slot') {
      qty = Math.min(10, Math.max(1, parseInt(body.qty, 10) || 1));
      // Kuota gabungan: slot custom + kartu admin, maks 50 total.
      const have = (await countUserSlots(session.id)) + (await countDisplayCards(session.id));
      if (have + qty > MAX_SLOTS_PER_USER) {
        return jsonFail(`Maksimal ${MAX_SLOTS_PER_USER} kartu pajangan per user (punya ${have}: custom + admin).`, 400);
      }
      amountIdr = SLOT_PRICE_IDR * qty;
      ref = 'display-slot';
      itemName = `Slot Kartu Pajangan x${qty} KartuYogaa`;
    } else {
      return jsonFail('Jenis order tidak dikenal.', 400);
    }
    // merchant_ref Tripay = order_id kita (dipakai verifikasi callback & cek status).
    const orderId = genMerchantOrderId();
    let tx;
    if (isPaymentSimulationEnabled()) {
      tx = createSimulatedTransaction({ orderId, amount: amountIdr });
    } else {
      tx = await createTripayTransaction({
        orderId,
        amount: amountIdr,
        customerName: session.username || 'KartuYogaa User',
        customerEmail: `noreply+${session.id}@kartu.yogaa.web.id`,
        customerPhone: '081234567890',
        itemName,
      });
    }
    const now = Date.now();
    await getDb().execute({
      sql: `INSERT INTO shop_orders (order_id, user_id, username, kind, ref, qty, amount_idr, xp_amount, status, pay_id, qr_url, qr_content, checkout_url, pay_channel, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`,
      args: [orderId, String(session.id), String(session.username || ''), kind, ref, qty, amountIdr, xpAmount,
        tx.payId, tx.qrUrl, tx.qrContent, tx.checkoutUrl, tx.channelName, now, now],
    });
    const out = {
      success: true,
      orderId,
      qrUrl: tx.qrUrl,
      qrContent: tx.qrContent,
      checkoutUrl: tx.checkoutUrl,
      qrChannel: tx.channelName,
    };
    if (idemKey) await saveIdempotency(db, idemKey, session.id, 'shop/order', 200, out);
    return jsonOk({
      orderId,
      qrUrl: tx.qrUrl,
      qrContent: tx.qrContent,
      checkoutUrl: tx.checkoutUrl,
      qrChannel: tx.channelName,
    });
  } catch (e) {
    console.error('[SHOP ORDER]', e.message);
    let msg = 'Gagal membuat pembayaran. Coba lagi.';
    if (/TRIPAY_(MERCHANT_CODE|API_KEY|PRIVATE_KEY)/.test(e.message)) {
      msg = 'Pembayaran belum dikonfigurasi. Hubungi admin.';
    } else if (e.message) {
      msg = e.message;
    }
    return jsonFail(msg, 502);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/shop/order/route.js' });
