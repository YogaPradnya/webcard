import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { getMissionStatus, recordEvent } from '@/lib/missions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




// GET /api/missions — status progres + klaim. Sekaligus mencatat misi
// "buka web hari ini" (login harian).
async function GET_impl(req, _ctx, session) {
  try {
    await recordEvent(session.id, session.username, 'login', 1);
    const status = await getMissionStatus(session.id);
    return jsonOk({ ...status });
  } catch (e) {
    console.error('[MISSIONS]', e.message);
    return jsonFail('Gagal memuat misi.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/missions/route.js' });
