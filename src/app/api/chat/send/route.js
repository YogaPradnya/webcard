import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ensureChatTable, sanitizeMessage, CHAT_MAX_LEN, CHAT_RATE_MS } from '@/lib/chat';
import { ensureWebTitleColumn, iconForTitle } from '@/lib/titles';
import { checkRate } from '@/lib/rateLimit';

// POST /api/chat { message, replyToId? } — kirim pesan grup web.
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
  const rate = await checkRate(`chat:${session.id}`, CHAT_RATE_MS);
  if (!rate.ok) {
    return NextResponse.json({ success: false, message: 'Kirim terlalu cepat. Tunggu sebentar.' }, { status: 429 });
  }

  try {
    await ensureChatTable();
    await ensureWebTitleColumn();
    // Username + gelar WEB terpasang dari user_stats, fallback session.
    // custom_title (gelar costume bot) sengaja tidak dipakai.
    let username = session.username || '';
    let title = null;
    try {
      const r = await getDb().execute({
        sql: 'SELECT username, web_title FROM user_stats WHERE user_id = ?',
        args: [String(session.id)],
      });
      if (r.rows.length > 0) {
        if (r.rows[0].username) username = String(r.rows[0].username);
        if (r.rows[0].web_title) title = String(r.rows[0].web_title);
      }
    } catch { /* fallback */ }
    // Reply opsional: replyToId -> ambil pesan asli untuk quote.
    let replyToId = body.replyToId != null ? parseInt(body.replyToId, 10) : 0;
    let replyUsername = null;
    let replyMessage = null;
    if (Number.isFinite(replyToId) && replyToId > 0) {
      try {
        const orig = await getDb().execute({
          sql: 'SELECT username, message FROM web_group_messages WHERE id = ?',
          args: [replyToId],
        });
        if (orig.rows.length > 0) {
          replyUsername = String(orig.rows[0].username || '');
          replyMessage = String(orig.rows[0].message || '').slice(0, 200);
        } else {
          replyToId = 0;
        }
      } catch {
        replyToId = 0;
      }
    } else {
      replyToId = 0;
    }
    const res = await getDb().execute({
      sql: 'INSERT INTO web_group_messages (user_id, username, message, created_at, reply_to_id, reply_username, reply_message) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [String(session.id), username, message, now, replyToId || null, replyUsername, replyMessage],
    });
    const id = Number(res.lastInsertRowid) || 0;
    return NextResponse.json({
      success: true,
      message: { id, userId: String(session.id), username, message, createdAt: now, isMine: true, title, titleIcon: iconForTitle(title), replyToId: replyToId || null, replyUsername, replyMessage },
    });
  } catch (e) {
    console.error('[CHAT POST]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal kirim pesan.' }, { status: 500 });
  }
}
