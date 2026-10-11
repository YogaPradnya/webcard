import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ensureBattleRooms } from '@/lib/rooms';

// GET /api/battle/leaderboard — klasemen PvP (menang/kalah).
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });

  try {
    await ensureBattleRooms();
    const res = await getDb().execute({
      sql: 'SELECT user_id, username, wins, losses FROM battle_leaderboard ORDER BY wins DESC, losses ASC LIMIT 20',
      args: [],
    });
    const rows = res.rows.map((r) => {
      const wins = Number(r.wins) || 0;
      const losses = Number(r.losses) || 0;
      const total = wins + losses;
      return {
        username: String(r.username || ''),
        wins,
        losses,
        winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
        isMe: String(r.user_id) === String(session.id),
      };
    });
    return NextResponse.json({ success: true, leaderboard: rows });
  } catch (e) {
    console.error('[BATTLE LB]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat leaderboard.' }, { status: 500 });
  }
}
