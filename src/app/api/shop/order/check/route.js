import { getOrder, syncOrderFromPaydisini } from '@/lib/shop';
import { checkRateCount } from '@/lib/rateLimit';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/shop/order/check { orderId } — tanya status ke PayDisini langsung.
// Dipakai tombol "Cek Status" + auto-cek (penting untuk localhost yang
// tak terjangkau callback, dan cadangan bila callback gagal di production).
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const orderId = String(body.orderId || '').trim();
  if (!orderId) return jsonFail('orderId wajib diisi.', 400);
  const attempt = await checkRateCount(`shopcheck:${session.id}`, 30, 60 * 1000);
  if (!attempt.ok) {
    return jsonFail('Terlalu sering cek status. Tunggu sebentar.', 429);
  }
  try {
    const order = await getOrder(orderId);
    if (!order || String(order.userId) !== String(session.id)) {
      return jsonFail('Order tidak ditemukan.', 404);
    }
    const r = await syncOrderFromPaydisini(orderId);
    return jsonOk({ status: r.status, reason: r.reason || null });
  } catch (e) {
    console.error('[SHOP CHECK]', e.message);
    return jsonFail('Gagal cek status. Coba lagi.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/shop/order/check/route.js' });
