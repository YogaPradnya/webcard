import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ensureBattleRooms, WAITING_TTL_MS, cleanupExpiredWaitingRooms } from '@/lib/rooms';

// GET /api/battle/mine — room aktif milik user (waiting + ongoing) untuk auto-restore.
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
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
      const yourSide = String(r.p1_id) === String(session.id) ? 'player' : 'enemy';
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
        expiresAt: createdAt + WAITING_TTL_MS,
        secondsLeft: Math.max(0, Math.ceil((createdAt + WAITING_TTL_MS - now) / 1000)),
      };
    });
    return NextResponse.json({ success: true, rooms });
  } catch (e) {
    console.error('[BATTLE MINE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat room aktif.' }, { status: 500 });
  }
}
