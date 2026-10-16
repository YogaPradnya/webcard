import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { ensureBattleRooms } from '@/lib/rooms';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




// GET /api/battle/history?limit=10 — riwayat battle milik sendiri.
async function GET_impl(req, _ctx, session) {
  const params = new URL(req.url).searchParams;
  const limit = Math.min(30, Math.max(1, parseInt(params.get('limit'), 10) || 10));
  try {
    await ensureBattleRooms();
    const res = await getDb().execute({
      sql: `SELECT code, mode, p1_id, p1_username, p2_id, p2_username, winner_id, reason, created_at
            FROM battle_history WHERE p1_id = ? OR p2_id = ?
            ORDER BY id DESC LIMIT ?`,
      args: [String(session.id), String(session.id), limit],
    });
    const history = res.rows.map((r) => {
      const isP1 = String(r.p1_id) === String(session.id);
      const foe = isP1 ? String(r.p2_username || 'AI') : String(r.p1_username || '');
      const won = r.winner_id ? String(r.winner_id) === String(session.id) : false;
      return {
        code: String(r.code),
        mode: String(r.mode || 'pvp'),
        foe,
        won,
        reason: String(r.reason || ''),
        createdAt: Number(r.created_at) || 0,
      };
    });
    return jsonOk({ history });
  } catch (e) {
    console.error('[BATTLE HISTORY]', e.message);
    return jsonFail('Gagal memuat riwayat.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/battle/history/route.js' });
