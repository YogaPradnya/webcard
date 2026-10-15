import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { listUserSlots, MAX_SLOTS_PER_USER, ensureShopTables } from '@/lib/shop';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// GET /api/shop/slots — slot kartu pajangan milik user.
async function GET_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  try {
    await ensureShopTables();
    const slots = await listUserSlots(session.id);
    return NextResponse.json({ success: true, slots, maxSlots: MAX_SLOTS_PER_USER });
  } catch (e) {
    console.error('[SHOP SLOTS]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat slot.' }, { status: 500 });
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = withTimeout(GET_impl, READ_TIMEOUT_MS, 'src/app/api/shop/slots/route.js');
