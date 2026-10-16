import {
  verifyWebhookSignature, getOrder, setOrderStatus, fulfillPaidOrder, ensureShopTables,
} from '@/lib/shop';
import { apiHandler, jsonOk, jsonFail, parseJson, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/shop/webhook — notifikasi Midtrans (tanpa login, verifikasi signature).
// Daftarkan URL ini di dashboard Midtrans: https://kartu.yogaa.web.id/api/shop/webhook
// Pakai req.json biasa (signature ada di body.signature_key, bukan raw-body/header),
// jadi aman dibungkus apiHandler auth:false. Midtrans hanya peduli status HTTP.
async function POST_impl(req) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return jsonFail('Payload tidak valid.', 400);
  const orderId = String(body.order_id || '');
  const statusCode = String(body.status_code || '');
  const grossAmount = String(body.gross_amount || '');
  if (!orderId) return jsonFail('Payload tidak valid.', 400);
  const valid = verifyWebhookSignature({
    orderId,
    statusCode,
    grossAmount,
    signature: String(body.signature_key || ''),
  });
  if (!valid) {
    console.warn('[SHOP WEBHOOK] Signature tidak valid:', orderId);
    return jsonFail('Signature tidak valid.', 403);
  }
  try {
    await ensureShopTables();
    const order = await getOrder(orderId);
    if (!order) return jsonOk({ ignored: true });
    if (order.status !== 'pending') return jsonOk({ ignored: true });
    // Cocokkan nominal agar order tidak bisa dimanipulasi.
    if (Number(grossAmount) !== Number(order.amountIdr)) {
      console.warn('[SHOP WEBHOOK] Nominal beda:', orderId, grossAmount, order.amountIdr);
      return jsonOk({ ignored: true });
    }
    const tx = String(body.transaction_status || '');
    const fraud = String(body.fraud_status || '');
    if (tx === 'capture' || tx === 'settlement') {
      if (tx === 'capture' && fraud === 'challenge') {
        return jsonOk({ ignored: true });
      }
      const r = await fulfillPaidOrder(order, { paymentType: body.payment_type });
      if (!r.fulfilled) console.warn('[SHOP WEBHOOK] Gagal penuhi:', orderId, r.reason);
      return jsonOk();
    }
    if (tx === 'pending') return jsonOk();
    if (['deny', 'cancel', 'expire', 'failure'].includes(tx)) {
      await setOrderStatus(orderId, tx === 'expire' ? 'expired' : 'failed');
      return jsonOk();
    }
    return jsonOk({ ignored: true });
  } catch (e) {
    console.error('[SHOP WEBHOOK]', e.message);
    return jsonFail('Gagal proses webhook.', 500);
  }
}

// Tanpa auth (verifikasi signature Midtrans); batas hang via apiHandler.
export const POST = apiHandler(POST_impl, { auth: false, timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/shop/webhook/route.js' });
