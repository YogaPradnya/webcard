import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { getDisplayCards } from '@/lib/display';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




// GET /api/display — koleksi kartu pajangan (display-only) milik user login.
async function GET_impl(req, _ctx, session) {
  try {
    const data = await getDisplayCards(session.id);
    return jsonOk({ ...data });
  } catch (e) {
    console.error('[DISPLAY]', e.message);
    return jsonFail('Gagal memuat kartu pajangan.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/display/route.js' });
