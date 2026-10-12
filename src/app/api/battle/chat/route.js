import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ensureBattleChatTable, sanitizeBattleMessage, BATTLE_CHAT_PAGE_SIZE, BATTLE_CHAT_RATE_MS } from '@/lib/battleChat';
import { ensureBattleRooms, getRoom, sideOf } from '@/lib/rooms';
import { checkRate } from '@/lib/rateLimit';

// GET /api/battle/chat?code=123456&afterId=0 — chat sementara khusus room battle.
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const code = String(params.get('code') || '').replace(/[^0-9]/g, '');
  const afterId = parseInt(params.get('afterId'), 10) || 0;
  const limit = Math.min(50, Math.max(1, parseInt(params.get('limit'), 10) || BATTLE_CHAT_PAGE_SIZE));
  if (!code) return NextResponse.json({ success: false, message: 'Kode wajib diisi.' }, { status: 400 });
  try {
    await ensureBattleRooms();
    await ensureBattleChatTable();
    const room = await getRoom(code);
    if (!room || !sideOf(room, session.id)) {
      return NextResponse.json({ success: false, message: 'Bukan room kamu.' }, { status: 403 });
    }
    const res = await getDb().execute({
      sql: 'SELECT id, user_id, username, message, created_at FROM battle_messages WHERE code = ? AND id > ? ORDER BY id ASC LIMIT ?',
      args: [code, afterId, limit],
    });
    const messages = res.rows.map((r) => ({
      id: Number(r.id),
      userId: String(r.user_id),
      username: String(r.username || ''),
      message: String(r.message || ''),
      createdAt: Number(r.created_at) || 0,
      isMine: String(r.user_id) === String(session.id),
    }));
    return NextResponse.json({ success: true, messages });
  } catch (e) {
    console.error('[BATTLE CHAT GET]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat chat battle.' }, { status: 500 });
  }
}

// POST /api/battle/chat { code, message } — kirim chat ke room battle.
export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const code = String(body.code || '').replace(/[^0-9]/g, '');
  const message = sanitizeBattleMessage(body.message);
  if (!code || !message) {
    return NextResponse.json({ success: false, message: 'Kode dan pesan wajib diisi.' }, { status: 400 });
  }
  const key = `${session.id}:${code}`;
  const rate = await checkRate(`bchat:${key}`, BATTLE_CHAT_RATE_MS);
  if (!rate.ok) {
    return NextResponse.json({ success: false, message: 'Kirim terlalu cepat.' }, { status: 429 });
  }
  const now = Date.now();
  try {
    await ensureBattleRooms();
    await ensureBattleChatTable();
    const room = await getRoom(code);
    if (!room || !sideOf(room, session.id)) {
      return NextResponse.json({ success: false, message: 'Bukan room kamu.' }, { status: 403 });
    }
    let username = session.username || '';
    try {
      const r = await getDb().execute({
        sql: 'SELECT username FROM user_stats WHERE user_id = ?',
        args: [String(session.id)],
      });
      if (r.rows.length > 0 && r.rows[0].username) username = String(r.rows[0].username);
    } catch { /* fallback */ }
    const res = await getDb().execute({
      sql: 'INSERT INTO battle_messages (code, user_id, username, message, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [code, String(session.id), username, message, now],
    });
    // Retensi: hapus chat battle lebih dari 7 hari (best-effort).
    try {
      await getDb().execute({ sql: 'DELETE FROM battle_messages WHERE created_at < ?', args: [now - 7 * 24 * 3600 * 1000] });
    } catch { /* non-kritis */ }
    const id = Number(res.lastInsertRowid) || 0;
    return NextResponse.json({
      success: true,
      message: { id, userId: String(session.id), username, message, createdAt: now, isMine: true },
    });
  } catch (e) {
    console.error('[BATTLE CHAT POST]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal kirim chat.' }, { status: 500 });
  }
}
