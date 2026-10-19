import {
  verifyTripayCallbackSignature, mapTripayStatus, tripayChannelName,
  getOrder, setOrderStatus, fulfillPaidOrder, ensureShopTables,
} from '@/lib/shop';
import { apiHandler, jsonFail, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';
import { NextResponse } from 'next/server';

// POST /api/shop/webhook — callback Tripay (JSON, tanpa login).
// Daftarkan URL ini di dashboard Tripay: https://kartu.yogaa.web.id/api/shop/webhook
// Header: X-Callback-Signature + X-Callback-Event: payment_status.
// Tripay mewajibkan balasan {"success": true} agar tidak retry.
function ack() {
  return NextResponse.json({ success: true });
}

async function POST_impl(req) {
  let rawBody;
  try {
    rawBody = await req.text();
  } catch {
    return jsonFail('Payload tidak valid.', 400);
  }

  const signature = req.headers.get('x-callback-signature') || '';
  if (!verifyTripayCallbackSignature({ rawBody, signature })) {
    console.warn('[SHOP WEBHOOK] Signature Tripay tidak valid');
    return jsonFail('Signature tidak valid.', 403);
  }

  const event = String(req.headers.get('x-callback-event') || '').trim();
  if (event && event !== 'payment_status') {
    console.warn('[SHOP WEBHOOK] Event tidak dikenal:', event);
    return jsonFail('Event callback tidak dikenal.', 400);
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonFail('Payload tidak valid.', 400);
  }

  const orderId = String(body?.merchant_ref || '').trim();
  const reference = String(body?.reference || '').trim();
  const status = String(body?.status || '').trim();
  if (!orderId || !reference || !status) {
    return jsonFail('Payload tidak valid.', 400);
  }

  try {
    await ensureShopTables();
    const order = await getOrder(orderId);
    if (!order) {
      // Order lama/non-Tripay — hentikan retry.
      console.warn('[SHOP WEBHOOK] Order tidak ditemukan:', orderId);
      return ack();
    }

    // Pastikan reference yang dikirim Tripay sama dengan yang disimpan saat create.
    if (order.payId && String(order.payId) !== reference) {
      console.warn('[SHOP WEBHOOK] Reference tidak cocok:', orderId, reference, order.payId);
      return ack();
    }

    // Callback open payment bukan untuk order closed payment kita.
    if (body?.is_closed_payment != null && Number(body.is_closed_payment) !== 1) {
      console.warn('[SHOP WEBHOOK] Bukan closed payment:', orderId);
      return ack();
    }

    const mapped = mapTripayStatus(status);

    // Refund perlu ditangani walau order sudah paid. Jangan otomatis menarik
    // XP/slot (bisa sudah terpakai); tandai untuk review admin.
    if (mapped === 'refund') {
      if (order.status === 'paid') {
        await setOrderStatus(orderId, 'refund');
        console.warn('[SHOP WEBHOOK] Refund diterima, cek manual:', orderId);
      }
      return ack();
    }

    // Anti double-kirim: order yang sudah paid/failed/refund diabaikan.
    if (order.status !== 'pending' && order.status !== 'expired') return ack();

    if (mapped === 'paid') {
      // Callback memuat total_amount (termasuk fee customer); bandingkan dengan
      // harga dasar, bukan amount_received yang sudah dipotong fee merchant.
      const paid = Number(body?.total_amount ?? 0) || 0;
      if (!paid || paid < Number(order.amountIdr)) {
        console.warn('[SHOP WEBHOOK] Nominal kurang:', orderId, paid, order.amountIdr);
        return ack();
      }
      const channel = tripayChannelName(
        body?.payment_method || body?.payment_method_code || order.payChannel,
      );
      const r = await fulfillPaidOrder(order, { paymentType: channel });
      if (!r.fulfilled) console.warn('[SHOP WEBHOOK] Gagal penuhi:', orderId, r.reason);
      return ack();
    }

    if (mapped === 'failed') {
      if (order.status === 'pending') await setOrderStatus(orderId, 'failed');
      return ack();
    }

    if (mapped === 'expired') {
      if (order.status === 'pending') await setOrderStatus(orderId, 'expired');
      return ack();
    }

    return ack();
  } catch (e) {
    console.error('[SHOP WEBHOOK]', e.message);
    return jsonFail('Gagal proses webhook.', 500);
  }
}

// Tanpa auth (verifikasi signature Tripay); batas hang via apiHandler.
export const POST = apiHandler(POST_impl, { auth: false, timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/shop/webhook/route.js' });
