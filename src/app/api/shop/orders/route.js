import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { listUserOrders, ensureShopTables } from '@/lib/shop';

// GET /api/shop/orders — 10 order terakhir milik user.
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  try {
    await ensureShopTables();
    const orders = await listUserOrders(session.id, 10);
    return NextResponse.json({ success: true, orders });
  } catch (e) {
    console.error('[SHOP ORDERS]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat order.' }, { status: 500 });
  }
}
