import { isPaymentSimulationEnabled, simulateOrderPayment } from '@/lib/shop';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/shop/order/simulate { orderId }
// Endpoint khusus mode simulasi/pengujian dev lokal untuk melunasi order
// tanpa harus bergantung pada gateway eksternal (Tokopay) yang sedang tutup.
async function POST_impl(req, _ctx, session) {
  if (!isPaymentSimulationEnabled()) {
    return jsonFail('Mode simulasi pembayaran tidak aktif.', 403);
  }

  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;

  const orderId = String(body.orderId || '').trim();
  if (!orderId) {
    return jsonFail('orderId wajib diisi.', 400);
  }

  try {
    const res = await simulateOrderPayment(orderId, session.id);
    return jsonOk({
      status: res.status,
      message: res.alreadyPaid
        ? 'Order ini sudah pernah dibayar sebelumnya.'
        : 'Pembayaran simulasi berhasil diverifikasi! Item sudah masuk.',
    });
  } catch (e) {
    console.error('[SHOP SIMULATE]', e.message);
    return jsonFail(e.message || 'Gagal memproses simulasi pembayaran.', 400);
  }
}

export const POST = apiHandler(POST_impl, {
  auth: true,
  timeout: WRITE_TIMEOUT_MS,
  tag: 'src/app/api/shop/order/simulate/route.js',
});
