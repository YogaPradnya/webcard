import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




// GET /api/auth/me — username otomatis dari sesi pairing (database bot).
// Tanpa request ke API Animein.
async function GET_impl(req, _ctx, session) {

  let username = session.username || null;
  try {
    const res = await getDb().execute({
      sql: 'SELECT username FROM user_stats WHERE user_id = ?',
      args: [session.id],
    });
    if (res.rows.length > 0 && res.rows[0].username) username = String(res.rows[0].username);
  } catch {
    // fallback ke username saat pairing
  }
  return jsonOk({ id: session.id, username });
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/auth/me/route.js' });
