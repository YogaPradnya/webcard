import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ensureChatTable } from '@/lib/chat';

// DELETE /api/chat?id=123 — hapus pesan milik sendiri.
export async function DELETE(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  const id = parseInt(new URL(req.url).searchParams.get('id'), 10) || 0;
  if (!id) return NextResponse.json({ success: false, message: 'ID tidak valid.' }, { status: 400 });
  try {
    await ensureChatTable();
    const res = await getDb().execute({
      sql: 'DELETE FROM web_group_messages WHERE id = ? AND user_id = ?',
      args: [id, String(session.id)],
    });
    if ((res.rowsAffected ?? 0) === 0) {
      return NextResponse.json({ success: false, message: 'Pesan tidak ditemukan / bukan milikmu.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, id });
  } catch (e) {
    console.error('[CHAT DELETE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal hapus pesan.' }, { status: 500 });
  }
}
