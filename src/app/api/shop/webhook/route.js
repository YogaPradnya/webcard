import {
  verifyTripayCallbackSignature, mapTripayStatus, tripayChannelName,
  getOrder, setOrderStatus, transitionOrderStatus, fulfillPaidOrder, ensureShopTables,
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
  const started = Date.now();
  let rawBody;
  try {
    rawBody = await req.text();
  } catch {
    return jsonFail('Payload tidak valid.', 400);
  }

  const signature = req.headers.get('x-callback-signature') || '';
  if (!verifyTripayCallbackSignature({ rawBody, signature })) {
    console.warn(`[SHOP WEBHOOK] Signature Tripay tidak valid took=${Date.now() - started}ms`);
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

  let matched = false;
  let outcome = 'error';
  try {
    await ensureShopTables();
    const order = await getOrder(orderId);
    if (!order) {
      // Order tidak dikenal — ack agar Tripay berhenti retry, tapi catat loud.
      outcome = 'order-not-found';
      return ack();
    }
    matched = true;

    // Pastikan reference yang dikirim Tripay sama dengan yang disimpan saat create.
    // Bila payId belum tersimpan (callback balapan dengan setOrderPayment),
    // lewati cek ini: order tetap diverifikasi lewat merchant_ref + nominal.
    if (order.payId && String(order.payId) !== reference) {
      outcome = 'reference-mismatch';
      return ack();
    }

    // Callback open payment bukan untuk order closed payment kita.
    if (body?.is_closed_payment != null && Number(body.is_closed_payment) !== 1) {
      outcome = 'not-closed-payment';
      return ack();
    }

    const mapped = mapTripayStatus(status);
    outcome = mapped;

    // Refund perlu ditangani walau order sudah paid. Jangan otomatis menarik
    // XP/slot (bisa sudah terpakai); tandai untuk review admin.
    if (mapped === 'refund') {
      if (order.status === 'paid') {
        await setOrderStatus(orderId, 'refund');
        console.warn('[SHOP WEBHOOK] Refund diterima, cek manual:', orderId);
        outcome = 'refund';
      } else {
        outcome = 'refund-ignored';
      }
      return ack();
    }

    // Anti double-kirim: order yang sudah paid/failed/refund diabaikan.
    // Khusus PAID saat order masih 'processing' (callback balapan dengan
    // auto-check), minta Tripay retry agar pembayaran tidak hilang bila
    // pemroses pertama gagal.
    if (order.status !== 'pending' && order.status !== 'expired') {
      if (order.status === 'processing' && mapped === 'paid') {
        outcome = 'paid:in-progress';
        return jsonFail('Pesanan sedang diproses.', 500);
      }
      outcome = `ignored:${order.status}`;
      return ack();
    }

    if (mapped === 'paid') {
      // Callback memuat total_amount (termasuk fee customer); bandingkan dengan
      // harga dasar, bukan amount_received yang sudah dipotong fee merchant.
      const paid = Number(body?.total_amount ?? 0) || 0;
      if (!paid || paid < Number(order.amountIdr)) {
        outcome = `paid:nominal-kurang(${paid}<${order.amountIdr})`;
        return ack();
      }
      const channel = tripayChannelName(
        body?.payment_method || body?.payment_method_code || order.payChannel,
      );
      const r = await fulfillPaidOrder(order, { paymentType: channel });
      if (!r.fulfilled && !r.alreadyPaid) {
        outcome = `paid:gagal(${r.reason || 'unknown'})`;
        console.warn('[SHOP WEBHOOK] Gagal penuhi:', orderId, r.reason);
      } else {
        outcome = r.alreadyPaid ? 'paid:already' : 'paid:fulfilled';
      }
      return ack();
    }

    if (mapped === 'failed') {
      await transitionOrderStatus(orderId, 'failed', ['pending', 'expired']);
      outcome = 'failed';
      return ack();
    }

    if (mapped === 'expired') {
      await transitionOrderStatus(orderId, 'expired', ['pending']);
      outcome = 'expired';
      return ack();
    }

    outcome = `ignored:${mapped}`;
    return ack();
  } catch (e) {
    outcome = 'error';
    console.error('[SHOP WEBHOOK]', e.message);
    return jsonFail('Gagal proses webhook.', 500);
  } finally {
    const took = Date.now() - started;
    const line = `[SHOP WEBHOOK] order=${orderId || '-'} ref=${reference || '-'} status=${status || '-'} matched=${matched} outcome=${outcome} took=${took}ms`;
    if (took > 3000 || outcome === 'error' || !matched) console.warn(line);
    else console.log(line);
  }
}

// Tanpa auth (verifikasi signature Tripay); batas hang via apiHandler.
export const POST = apiHandler(POST_impl, { auth: false, timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/shop/webhook/route.js' });
