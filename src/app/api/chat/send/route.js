import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ensureChatTable, sanitizeMessage, CHAT_MAX_LEN, CHAT_RATE_MS } from '@/lib/chat';

const lastSend = new Map(); // userId -> timestamp

// POST /api/chat { message } — kirim pesan grup web.
export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const message = sanitizeMessage(body.message);
  if (!message) return NextResponse.json({ success: false, message: 'Pesan kosong.' }, { status: 400 });
  if (message.length > CHAT_MAX_LEN) {
    return NextResponse.json({ success: false, message: `Maks ${CHAT_MAX_LEN} karakter.` }, { status: 400 });
  }

  const now = Date.now();
  const prev = lastSend.get(String(session.id)) || 0;
  if (now - prev < CHAT_RATE_MS) {
    return NextResponse.json({ success: false, message: 'Kirim terlalu cepat. Tunggu sebentar.' }, { status: 429 });
  }
  lastSend.set(String(session.id), now);

  try {
    await ensureChatTable();
    // Username terbaru dari Animein (user_stats), fallback session.
    let username = session.username || '';
    try {
      const r = await getDb().execute({
        sql: 'SELECT username FROM user_stats WHERE user_id = ?',
        args: [String(session.id)],
      });
      if (r.rows.length > 0 && r.rows[0].username) username = String(r.rows[0].username);
    } catch { /* fallback */ }
    const res = await getDb().execute({
      sql: 'INSERT INTO web_group_messages (user_id, username, message, created_at) VALUES (?, ?, ?, ?)',
      args: [String(session.id), username, message, now],
    });
    const id = Number(res.lastInsertRowid) || 0;
    return NextResponse.json({
      success: true,
      message: { id, userId: String(session.id), username, message, createdAt: now, isMine: true },
    });
  } catch (e) {
    console.error('[CHAT POST]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal kirim pesan.' }, { status: 500 });
  }
}
