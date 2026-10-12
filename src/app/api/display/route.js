import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDisplayCards } from '@/lib/display';

// GET /api/display — koleksi kartu pajangan (display-only) milik user login.
export async function GET(req) {
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
