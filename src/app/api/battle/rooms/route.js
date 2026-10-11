import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { ensureBattleRooms, WAITING_TTL_MS, cleanupExpiredWaitingRooms } from '@/lib/rooms';

const PAGE_SIZE = 10;

// GET /api/battle/rooms?q=&page= — list room PvP waiting yang masih hidup (10/page).
// Hanya usn + kode + sisa waktu. Search cocok ke username dan kode.
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const q = String(params.get('q') || '').trim().slice(0, 50);
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  try {
    await ensureBattleRooms();
    const now = Date.now();
    await cleanupExpiredWaitingRooms(now);
    const minCreated = now - WAITING_TTL_MS;

    const like = `%${q}%`;
    const where = q
      ? `WHERE mode = 'pvp' AND status = 'waiting' AND created_at >= ? AND (p1_username LIKE ? OR code LIKE ?)`
      : `WHERE mode = 'pvp' AND status = 'waiting' AND created_at >= ?`;
    const args = q ? [minCreated, like, like] : [minCreated];

    const countRes = await getDb().execute({
      sql: `SELECT COUNT(*) AS total FROM battle_rooms ${where}`,
      args,
    });
    const total = Number(countRes.rows[0]?.total || 0);

    const res = await getDb().execute({
      sql: `SELECT code, p1_id, p1_username, created_at FROM battle_rooms ${where}
            ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [...args, PAGE_SIZE, offset],
    });
    const rooms = res.rows.map((r) => {
      const createdAt = Number(r.created_at) || 0;
      return {
        code: String(r.code),
        username: String(r.p1_username || ''),
        createdAt,
        expiresAt: createdAt + WAITING_TTL_MS,
        secondsLeft: Math.max(0, Math.ceil((createdAt + WAITING_TTL_MS - now) / 1000)),
        isMine: String(r.p1_id) === String(session.id),
      };
    });
    return NextResponse.json({
      success: true,
      rooms,
      pagination: { page, limit: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
      q,
    });
  } catch (e) {
    console.error('[BATTLE ROOMS]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat battle ready.' }, { status: 500 });
  }
}
