import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ensureChatTable, CHAT_PAGE_SIZE } from '@/lib/chat';

// GET /api/chat?limit=&beforeId= — history terbaru ala WA (urut tua -> baru).
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const limit = Math.min(50, Math.max(1, parseInt(params.get('limit'), 10) || CHAT_PAGE_SIZE));
  const beforeId = parseInt(params.get('beforeId'), 10) || 0;
  const afterId = parseInt(params.get('afterId'), 10) || 0;

  try {
    await ensureChatTable();
    const db = getDb();
    let rows;
    if (afterId > 0) {
      const res = await db.execute({
        sql: 'SELECT id, user_id, username, message, created_at FROM web_group_messages WHERE id > ? ORDER BY id ASC LIMIT ?',
        args: [afterId, limit],
      });
      rows = res.rows;
    } else if (beforeId > 0) {
      const res = await db.execute({
        sql: 'SELECT id, user_id, username, message, created_at FROM web_group_messages WHERE id < ? ORDER BY id DESC LIMIT ?',
        args: [beforeId, limit],
      });
      rows = [...res.rows].reverse();
    } else {
      const res = await db.execute({
        sql: 'SELECT id, user_id, username, message, created_at FROM web_group_messages ORDER BY id DESC LIMIT ?',
        args: [limit],
      });
      rows = [...res.rows].reverse();
    }
    const messages = rows.map((r) => ({
      id: Number(r.id),
      userId: String(r.user_id),
      username: String(r.username || ''),
      message: String(r.message || ''),
      createdAt: Number(r.created_at) || 0,
      isMine: String(r.user_id) === String(session.id),
    }));
    return NextResponse.json({ success: true, messages, meId: String(session.id) });
  } catch (e) {
    console.error('[CHAT GET]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat chat.' }, { status: 500 });
  }
}
