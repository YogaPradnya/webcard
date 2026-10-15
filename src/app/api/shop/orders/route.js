import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { listUserOrders, ensureShopTables, expireStalePendingOrders } from '@/lib/shop';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// GET /api/shop/orders — 10 order terakhir milik user.
async function GET_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  try {
    await ensureShopTables();
    await expireStalePendingOrders(session.id);
    const orders = await listUserOrders(session.id, 10);
    return NextResponse.json({ success: true, orders });
  } catch (e) {
    console.error('[SHOP ORDERS]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat order.' }, { status: 500 });
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = withTimeout(GET_impl, READ_TIMEOUT_MS, 'src/app/api/shop/orders/route.js');
