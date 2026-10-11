import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getBookCards } from '@/lib/cards';

// GET /api/cards — 200 kartu + flag owned per user login.
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });

  try {
    const book = await getBookCards(session.id);
    return NextResponse.json({ success: true, ...book });
  } catch (e) {
    console.error('[CARDS]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat kartu.' }, { status: 500 });
  }
}
