import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// GET /api/trade/users — daftar user + jumlah kartu (untuk cari lawan trade).
async function GET_impl(req) {
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

// Batas hang server (penjaga Turso menggantung).
export const GET = withTimeout(GET_impl, READ_TIMEOUT_MS, 'src/app/api/trade/users/route.js');
