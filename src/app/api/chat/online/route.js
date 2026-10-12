import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ensureChatTable } from '@/lib/chat';

// GET /api/chat/online — user aktif 5 menit terakhir (dari pesan grup).
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  try {
    await ensureChatTable();
    const since = Date.now() - 5 * 60 * 1000;
    const res = await getDb().execute({
      sql: `SELECT username, MAX(created_at) AS last FROM web_group_messages
            WHERE created_at > ? GROUP BY user_id, username ORDER BY last DESC LIMIT 20`,
      args: [since],
    });
    const online = res.rows.map((r) => String(r.username || '')).filter(Boolean);
    return NextResponse.json({ success: true, online, count: online.length });
  } catch (e) {
    console.error('[CHAT ONLINE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat online.' }, { status: 500 });
  }
}
