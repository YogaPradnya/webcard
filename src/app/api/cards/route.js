import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { getBookCards } from '@/lib/cards';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




// GET /api/cards[?owned=1] — 265 kartu + flag owned per user login.
// owned=1: hanya kartu milik (ringkas untuk trade/convert).
async function GET_impl(req, _ctx, session) {

  try {
    const ownedOnly = new URL(req.url).searchParams.get('owned') === '1';
    const book = await getBookCards(session.id);
    if (!ownedOnly) return jsonOk({ ...book });
    const owned = book.cards.filter((c) => c.owned);
    return jsonOk({ cards: owned, total: book.total, ownedCount: owned.length });
  } catch (e) {
    console.error('[CARDS]', e.message);
    return jsonFail('Gagal memuat kartu.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/cards/route.js' });
