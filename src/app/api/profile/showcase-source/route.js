import { getShowcaseSource, setShowcaseSource } from '@/lib/profilePrefs';
import { apiHandler, jsonOk, jsonFail, parseJson, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




// GET /api/profile/showcase-source — pilihan pajangan .profil milik user login.
async function GET_impl(req, _ctx, session) {
  try {
    const source = await getShowcaseSource(session.id);
    return jsonOk({ source });
  } catch (e) {
    console.error('[SHOWCASE SOURCE]', e.message);
    return jsonFail('Gagal memuat pilihan.', 500);
  }
}

// POST /api/profile/showcase-source { source: 'auto'|'gacha'|'display' }
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  try {
    const result = await setShowcaseSource(session.id, body.source);
    if (!result.ok) return jsonFail(result.error, 400);
    return jsonOk({ source: result.source });
  } catch (e) {
    console.error('[SHOWCASE SOURCE]', e.message);
    return jsonFail('Gagal menyimpan pilihan.', 500);
  }
}

// Auth + batas hang server via apiHandler (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/profile/showcase-source/route.js' });
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/profile/showcase-source/route.js' });
