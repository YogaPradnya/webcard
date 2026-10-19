import {
  verifyTokopayCallbackSignature, mapTokopayStatus, tokopayChannelName,
  getOrder, setOrderStatus, fulfillPaidOrder, ensureShopTables,
} from '@/lib/shop';
import { apiHandler, jsonFail, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';
import { NextResponse } from 'next/server';

// POST /api/shop/webhook — callback Tokopay (JSON, tanpa login).
// Daftarkan URL ini di dashboard Tokopay: https://kartu.yogaa.web.id/api/shop/webhook
// Body: { reff_id, status, signature, data: { merchant_id, total_dibayar, ... } }
// Tokopay mewajibkan balasan {"status": true} agar tidak retry.
function ack() {
  return NextResponse.json({ status: true });
}

async function POST_impl(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonFail('Payload tidak valid.', 400);
  }
  const orderId = String(body?.reff_id || body?.ref_id || '').trim();
  const status = String(body?.status || '').trim();
  const merchantId = String(body?.merchant_id || body?.data?.merchant_id || '');
  const signature = String(body?.signature || '');
  if (!orderId || !status) return jsonFail('Payload tidak valid.', 400);
  if (!verifyTokopayCallbackSignature({ merchantId, refId: orderId, signature })) {
    console.warn('[SHOP WEBHOOK] Signature tidak valid:', orderId);
    return jsonFail('Signature tidak valid.', 403);
  }
  try {
    await ensureShopTables();
    const order = await getOrder(orderId);
    if (!order) {
      // Bisa jadi order lama/non-Tokopay — hentikan retry.
      console.warn('[SHOP WEBHOOK] Order tidak ditemukan:', orderId);
      return ack();
    }
    // Anti double-kirim: order yang sudah paid/failed diabaikan.
    if (order.status !== 'pending' && order.status !== 'expired') return ack();

    const mapped = mapTokopayStatus(status);
    if (mapped === 'paid') {
      // Signature tidak mencakup nominal, jadi pastikan pembayaran cukup.
      const paid = Number(body?.data?.total_dibayar ?? body?.data?.jumlah_bayar ?? 0) || 0;
      if (paid > 0 && paid < Number(order.amountIdr)) {
        console.warn('[SHOP WEBHOOK] Nominal kurang:', orderId, paid, order.amountIdr);
        return ack();
      }
      const channel = tokopayChannelName(body?.data?.payment_channel || order.payChannel || 'QRIS');
      const r = await fulfillPaidOrder(order, { paymentType: channel });
      if (!r.fulfilled) console.warn('[SHOP WEBHOOK] Gagal penuhi:', orderId, r.reason);
      return ack();
    }
    if (mapped === 'failed') {
      if (order.status === 'pending') await setOrderStatus(orderId, 'failed');
      return ack();
    }
    return ack();
  } catch (e) {
    console.error('[SHOP WEBHOOK]', e.message);
    return jsonFail('Gagal proses webhook.', 500);
  }
}

// Tanpa auth (verifikasi signature Tokopay); batas hang via apiHandler.
export const POST = apiHandler(POST_impl, { auth: false, timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/shop/webhook/route.js' });
