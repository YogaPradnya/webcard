import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';

// GET /api/trade/users — daftar user + jumlah kartu (untuk cari lawan trade).
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });

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
    return NextResponse.json({ success: true, users });
  } catch (e) {
    console.error('[TRADE USERS]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat user.' }, { status: 500 });
  }
}
