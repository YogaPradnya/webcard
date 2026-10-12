import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ensureBattleRooms } from '@/lib/rooms';

// GET /api/battle/leaderboard?tab=pvp|collector|xp — klasemen PvP, kolektor, XP.
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  const tab = String(new URL(req.url).searchParams.get('tab') || 'pvp');

  try {
    await ensureBattleRooms();
    const db = getDb();
    if (tab === 'collector') {
      const res = await db.execute({
        sql: `SELECT s.user_id, s.username, COUNT(c.char_name) AS owned
              FROM user_stats s LEFT JOIN user_cards c ON c.user_id = s.user_id
              GROUP BY s.user_id, s.username ORDER BY owned DESC LIMIT 20`,
        args: [],
      });
      const rows = res.rows.map((r) => ({
        username: String(r.username || ''),
        owned: Number(r.owned) || 0,
        isMe: String(r.user_id) === String(session.id),
      }));
      return NextResponse.json({ success: true, tab, leaderboard: rows });
    }
    if (tab === 'xp') {
      const res = await db.execute({
        sql: 'SELECT user_id, username, xp, level FROM user_stats ORDER BY xp DESC LIMIT 20',
        args: [],
      });
      const rows = res.rows.map((r) => ({
        username: String(r.username || ''),
        xp: Number(r.xp) || 0,
        level: Number(r.level) || 1,
        isMe: String(r.user_id) === String(session.id),
      }));
      return NextResponse.json({ success: true, tab, leaderboard: rows });
    }
    const res = await db.execute({
      sql: 'SELECT user_id, username, wins, losses, updated_at FROM battle_leaderboard ORDER BY wins DESC, losses ASC LIMIT 20',
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
    return NextResponse.json({ success: true, tab: 'pvp', leaderboard: rows });
  } catch (e) {
    console.error('[BATTLE LB]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat leaderboard.' }, { status: 500 });
  }
}
