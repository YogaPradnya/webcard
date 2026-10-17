import {
  verifyPaydisiniCallbackSignature, getOrder, setOrderStatus, fulfillPaidOrder, ensureShopTables,
} from '@/lib/shop';
import { apiHandler, jsonOk, jsonFail, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/shop/webhook — notifikasi PayDisini (tanpa login, verifikasi signature md5).
// Daftarkan URL ini di Pengaturan Akun PayDisini: https://kartu.yogaa.web.id/api/shop/webhook
// Body form-urlencoded: key, pay_id, unique_code, status, signature.
// Balasan yang diharapkan PayDisini: {"success": true} — jsonOk() sudah bentuk ini.
async function POST_impl(req) {
  let form;
  try {
    form = await req.formData();
  } catch {
    return jsonFail('Payload tidak valid.', 400);
  }
  const orderId = String(form.get('unique_code') || '');
  const status = String(form.get('status') || '');
  const key = String(form.get('key') || '');
  const signature = String(form.get('signature') || '');
  if (!orderId || !status) return jsonFail('Payload tidak valid.', 400);
  if (!verifyPaydisiniCallbackSignature({ key, uniqueCode: orderId, signature })) {
    console.warn('[SHOP WEBHOOK] Signature tidak valid:', orderId);
    return jsonFail('Signature tidak valid.', 403);
  }
  try {
    await ensureShopTables();
    const order = await getOrder(orderId);
    if (!order) return jsonOk({ ignored: true });
    // Anti double-kirim: order yang sudah paid/failed diabaikan.
    if (order.status !== 'pending' && order.status !== 'expired') return jsonOk({ ignored: true });
    if (status === 'Success') {
      // PayDisini tidak mengirim nominal di callback; amount sudah dipatok saat
      // pembuatan transaksi (unique_code = order_id kita), jadi tidak bisa dimanipulasi.
      const r = await fulfillPaidOrder(order, { paymentType: order.payChannel });
      if (!r.fulfilled) console.warn('[SHOP WEBHOOK] Gagal penuhi:', orderId, r.reason);
      return jsonOk();
    }
    if (status === 'Canceled') {
      if (order.status === 'pending') await setOrderStatus(orderId, 'failed');
      return jsonOk();
    }
    return jsonOk({ ignored: true });
  } catch (e) {
    console.error('[SHOP WEBHOOK]', e.message);
    return jsonFail('Gagal proses webhook.', 500);
  }
}

// Tanpa auth (verifikasi signature PayDisini); batas hang via apiHandler.
export const POST = apiHandler(POST_impl, { auth: false, timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/shop/webhook/route.js' });
