import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getBookCards } from '@/lib/cards';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// GET /api/cards[?owned=1] — 265 kartu + flag owned per user login.
// owned=1: hanya kartu milik (ringkas untuk trade/convert).
async function GET_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });

  try {
    const ownedOnly = new URL(req.url).searchParams.get('owned') === '1';
    const book = await getBookCards(session.id);
    if (!ownedOnly) return NextResponse.json({ success: true, ...book });
    const owned = book.cards.filter((c) => c.owned);
    return NextResponse.json({ success: true, cards: owned, total: book.total, ownedCount: owned.length });
  } catch (e) {
    console.error('[CARDS]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat kartu.' }, { status: 500 });
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = withTimeout(GET_impl, READ_TIMEOUT_MS, 'src/app/api/cards/route.js');
