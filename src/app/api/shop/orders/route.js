import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { listUserOrders, ensureShopTables, expireStalePendingOrders } from '@/lib/shop';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




// GET /api/shop/orders — 10 order terakhir milik user.
async function GET_impl(req, _ctx, session) {
  try {
    await ensureShopTables();
    // Paralel: expire tidak mengubah urutan list secara signifikan.
    const [, orders] = await Promise.all([
      expireStalePendingOrders(session.id),
      listUserOrders(session.id, 10),
    ]);
    return jsonOk({ orders });
  } catch (e) {
    console.error('[SHOP ORDERS]', e.message);
    return jsonFail('Gagal memuat order.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/shop/orders/route.js' });
