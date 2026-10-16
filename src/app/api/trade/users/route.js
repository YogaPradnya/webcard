import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




// GET /api/trade/users — daftar user + jumlah kartu (untuk cari lawan trade).
async function GET_impl(req, _ctx, session) {

  try {
    const res = await getDb().execute({
      sql: `SELECT s.user_id, s.username, COUNT(c.char_name) AS owned
            FROM user_stats s LEFT JOIN user_cards c ON c.user_id = s.user_id
            GROUP BY s.user_id, s.username ORDER BY owned DESC LIMIT 10`,
      args: [],
    });
    const users = res.rows.map((r) => ({
      username: String(r.username || ''),
      owned: Number(r.owned) || 0,
      isMe: String(r.user_id) === String(session.id),
    }));
    return jsonOk({ users });
  } catch (e) {
    console.error('[TRADE USERS]', e.message);
    return jsonFail('Gagal memuat user.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/trade/users/route.js' });
