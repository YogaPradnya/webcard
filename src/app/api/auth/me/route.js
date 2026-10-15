import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { withTimeout, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiTimeout';

// GET /api/auth/me — username otomatis dari sesi pairing (database bot).
// Tanpa request ke API Animein.
async function GET_impl(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });

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
  return NextResponse.json({ success: true, id: session.id, username });
}

// Batas hang server (penjaga Turso menggantung).
export const GET = withTimeout(GET_impl, READ_TIMEOUT_MS, 'src/app/api/auth/me/route.js');
