import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { getDb } from '@/lib/db';
import { ensureBattleRooms, WAITING_TTL_MS, FORFEIT_TIMEOUT_MS, forfeitMsLeft, cleanupExpiredWaitingRooms, parseRoom } from '@/lib/rooms';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




// GET /api/battle/mine — room aktif milik user (waiting + ongoing) untuk auto-restore.
async function GET_impl(req, _ctx, session) {
  try {
    await ensureBattleRooms();
    const now = Date.now();
    await cleanupExpiredWaitingRooms(now);
    const res = await getDb().execute({
      sql: `SELECT code, mode, p1_id, p1_username, p2_id, p2_username, state, turn, status, winner, result, created_at, updated_at
            FROM battle_rooms WHERE (p1_id = ? OR p2_id = ?) AND status IN ('waiting','ongoing')
            ORDER BY updated_at DESC LIMIT 5`,
      args: [String(session.id), String(session.id)],
    });
    const rooms = res.rows.map((r) => {
      let battle = {};
      let result = null;
      try { battle = JSON.parse(r.state || '{}'); } catch { battle = {}; }
      try { result = r.result ? JSON.parse(r.result) : null; } catch { result = null; }
      const createdAt = Number(r.created_at) || 0;
      const updatedAt = Number(r.updated_at) || 0;
      const yourSide = String(r.p1_id) === String(session.id) ? 'player' : 'enemy';
      const pseudo = { status: String(r.status || 'waiting'), battle, updatedAt };
      return {
        code: String(r.code),
        mode: String(r.mode || 'ai'),
        status: String(r.status || 'waiting'),
        turn: r.turn ? String(r.turn) : null,
        you: String(session.id),
        yourSide,
        p1Username: String(r.p1_username || ''),
        p2Username: String(r.p2_username || ''),
        battle,
        winner: r.winner ? String(r.winner) : null,
        result,
        createdAt,
        updatedAt,
        forfeitMsLeft: forfeitMsLeft(pseudo, now),
        forfeitTimeoutMs: FORFEIT_TIMEOUT_MS,
        expiresAt: createdAt + WAITING_TTL_MS,
        secondsLeft: Math.max(0, Math.ceil((createdAt + WAITING_TTL_MS - now) / 1000)),
      };
    });
    return jsonOk({ rooms });
  } catch (e) {
    console.error('[BATTLE MINE]', e.message);
    return jsonFail('Gagal memuat room aktif.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/battle/mine/route.js' });
