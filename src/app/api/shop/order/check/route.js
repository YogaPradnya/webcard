import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getOrder, syncOrderFromMidtrans } from '@/lib/shop';

// POST /api/shop/order/check { orderId } — tanya status ke Midtrans langsung.
// Dipakai tombol "Cek Status" + auto-cek (penting untuk localhost yang
// tak terjangkau webhook, dan cadangan bila webhook gagal di production).
export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const orderId = String(body.orderId || '').trim();
  if (!orderId) return NextResponse.json({ success: false, message: 'orderId wajib diisi.' }, { status: 400 });
  try {
    const order = await getOrder(orderId);
    if (!order || String(order.userId) !== String(session.id)) {
      return NextResponse.json({ success: false, message: 'Order tidak ditemukan.' }, { status: 404 });
    }
    const r = await syncOrderFromMidtrans(orderId);
    return NextResponse.json({ success: true, status: r.status, reason: r.reason || null });
  } catch (e) {
    console.error('[SHOP CHECK]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal cek status. Coba lagi.' }, { status: 500 });
  }
}
