import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDisplayCards } from '@/lib/display';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// GET /api/display — koleksi kartu pajangan (display-only) milik user login.
async function GET_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  try {
    const data = await getDisplayCards(session.id);
    return NextResponse.json({ success: true, ...data });
  } catch (e) {
    console.error('[DISPLAY]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat kartu pajangan.' }, { status: 500 });
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = withTimeout(GET_impl, READ_TIMEOUT_MS, 'src/app/api/display/route.js');
