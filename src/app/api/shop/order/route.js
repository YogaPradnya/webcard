import { getDb } from '@/lib/db';
import { checkRateCount } from '@/lib/rateLimit';
import {
  SLOT_PRICE_IDR, MAX_SLOTS_PER_USER, findPack, genMerchantOrderId,
  createPaydisiniTransaction, countUserSlots, ensureShopTables, isShopEnabled,
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
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const kind = String(body.kind || '');
  const attempt = await checkRateCount(`shoporder:${session.id}`, 10, 60 * 1000);
  if (!attempt.ok) {
    return jsonFail('Terlalu sering bikin order. Tunggu sebentar.', 429);
  }
  try {
    await ensureShopTables();
    await ensureIdempotencyTable();
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
      itemName = `Top-Up ${xpAmount.toLocaleString('id-ID')} XP Animein`;
    } else if (kind === 'slot') {
      qty = Math.min(10, Math.max(1, parseInt(body.qty, 10) || 1));
      // Kuota gabungan: slot custom + kartu admin, maks 50 total.
      const have = (await countUserSlots(session.id)) + (await countDisplayCards(session.id));
      if (have + qty > MAX_SLOTS_PER_USER) {
        return jsonFail(`Maksimal ${MAX_SLOTS_PER_USER} kartu pajangan per user (punya ${have}: custom + admin).`, 400);
      }
      amountIdr = SLOT_PRICE_IDR * qty;
      ref = 'display-slot';
      itemName = `Slot Kartu Pajangan x${qty} Animein`;
    } else {
      return jsonFail('Jenis order tidak dikenal.', 400);
    }
    // unique_code PayDisini = order_id kita (dipakai verifikasi callback & cek status).
    const orderId = genMerchantOrderId();
    const tx = await createPaydisiniTransaction({
      orderId,
      amount: amountIdr,
      note: `${itemName} — ${session.username || 'Animein'}`,
    });
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
    const msg = /PAYDISINI_API_KEY/.test(e.message)
      ? 'Pembayaran belum dikonfigurasi. Hubungi admin.'
      : 'Gagal membuat pembayaran. Coba lagi.';
    return jsonFail(msg, 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/shop/order/route.js' });
