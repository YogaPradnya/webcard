import { NextResponse } from 'next/server';
import {
  verifyWebhookSignature, getOrder, setOrderStatus, fulfillPaidOrder, ensureShopTables,
} from '@/lib/shop';

// POST /api/shop/webhook — notifikasi Midtrans (tanpa login, verifikasi signature).
// Daftarkan URL ini di dashboard Midtrans: https://kartu.yogaa.web.id/api/shop/webhook
export async function POST(req) {
  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }
  const orderId = String(body.order_id || '');
  const statusCode = String(body.status_code || '');
  const grossAmount = String(body.gross_amount || '');
  if (!orderId) return NextResponse.json({ success: false }, { status: 400 });
  const valid = verifyWebhookSignature({
    orderId,
    statusCode,
    grossAmount,
    signature: String(body.signature_key || ''),
  });
  if (!valid) {
    console.warn('[SHOP WEBHOOK] Signature tidak valid:', orderId);
    return NextResponse.json({ success: false }, { status: 403 });
  }
  try {
    await ensureShopTables();
    const order = await getOrder(orderId);
    if (!order) return NextResponse.json({ success: true, ignored: true });
    if (order.status !== 'pending') return NextResponse.json({ success: true, ignored: true });
    // Cocokkan nominal agar order tidak bisa dimanipulasi.
    if (Number(grossAmount) !== Number(order.amountIdr)) {
      console.warn('[SHOP WEBHOOK] Nominal beda:', orderId, grossAmount, order.amountIdr);
      return NextResponse.json({ success: true, ignored: true });
    }
    const tx = String(body.transaction_status || '');
    const fraud = String(body.fraud_status || '');
    if (tx === 'capture' || tx === 'settlement') {
      if (tx === 'capture' && fraud === 'challenge') {
        return NextResponse.json({ success: true, ignored: true });
      }
      const r = await fulfillPaidOrder(order, { paymentType: body.payment_type });
      if (!r.fulfilled) console.warn('[SHOP WEBHOOK] Gagal penuhi:', orderId, r.reason);
      return NextResponse.json({ success: true });
    }
    if (tx === 'pending') return NextResponse.json({ success: true });
    if (['deny', 'cancel', 'expire', 'failure'].includes(tx)) {
      await setOrderStatus(orderId, tx === 'expire' ? 'expired' : 'failed');
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ success: true, ignored: true });
  } catch (e) {
    console.error('[SHOP WEBHOOK]', e.message);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
