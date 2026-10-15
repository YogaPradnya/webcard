import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { ensureBattleRooms } from '@/lib/rooms';
import { getDb } from '@/lib/db';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// GET /api/battle/history?limit=10 — riwayat battle milik sendiri.
async function GET_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
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
    return NextResponse.json({ success: true, history });
  } catch (e) {
    console.error('[BATTLE HISTORY]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat riwayat.' }, { status: 500 });
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = withTimeout(GET_impl, READ_TIMEOUT_MS, 'src/app/api/battle/history/route.js');
