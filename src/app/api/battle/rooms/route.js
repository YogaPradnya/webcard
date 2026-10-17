import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { getDb } from '@/lib/db';
import { ensureBattleRooms, WAITING_TTL_MS, maybeCleanupRooms } from '@/lib/rooms';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




const PAGE_SIZE = 10;

// List room publik berubah pelan (TTL room 5 mnt) -> cache 10 dtk.
// Cleanup DELETE berat di-throttle global di lib/rooms (maybeCleanupRooms).
const _roomsCache = new Map(); // `${q}|${page}` -> { at, payload }
const ROOMS_TTL_MS = 10 * 1000;

// GET /api/battle/rooms?q=&page= — list room PvP waiting yang masih hidup (10/page).
// Hanya usn + kode + sisa waktu. Search cocok ke username dan kode.
async function GET_impl(req, _ctx, session) {
  const params = new URL(req.url).searchParams;
  const q = String(params.get('q') || '').trim().slice(0, 50);
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  try {
    await ensureBattleRooms();
    const cacheKey = `${q}|${page}`;
    const hit = _roomsCache.get(cacheKey);
    if (hit && Date.now() - hit.at < ROOMS_TTL_MS) {
      const t = Date.now();
      const rooms = hit.payload.rooms.map((r) => ({
        code: r.code,
        username: r.username,
        createdAt: r.createdAt,
        expiresAt: r.createdAt + WAITING_TTL_MS,
        secondsLeft: Math.max(0, Math.ceil((r.createdAt + WAITING_TTL_MS - t) / 1000)),
        isMine: String(r.p1_id) === String(session.id),
      }));
      return jsonOk({ rooms, pagination: hit.payload.pagination, q });
    }
    const now = Date.now();
    await maybeCleanupRooms(now);
    const minCreated = now - WAITING_TTL_MS;

    const like = `%${q}%`;
    const where = q
      ? `WHERE mode = 'pvp' AND status = 'waiting' AND created_at >= ? AND (p1_username LIKE ? OR code LIKE ?)`
      : `WHERE mode = 'pvp' AND status = 'waiting' AND created_at >= ?`;
    const args = q ? [minCreated, like, like] : [minCreated];

    // COUNT + SELECT paralel via execute (JANGAN db.batch: patologi Turso
    // 17 Okt = batch statement puluhan detik per statement).
    const [countRes, res] = await Promise.all([
      getDb().execute({ sql: `SELECT COUNT(*) AS total FROM battle_rooms ${where}`, args }),
      getDb().execute({
        sql: `SELECT code, p1_id, p1_username, created_at FROM battle_rooms ${where}
            ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        args: [...args, PAGE_SIZE, offset],
      }),
    ]);
    const total = Number(countRes.rows[0]?.total || 0);
    const pagination = { page, limit: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
    // Cache mentah (tanpa countdown) agar angka sisa waktu tetap fresh.
    _roomsCache.set(cacheKey, {
      at: Date.now(),
      payload: {
        rooms: res.rows.map((r) => ({
          code: String(r.code),
          username: String(r.p1_username || ''),
          p1_id: String(r.p1_id),
          createdAt: Number(r.created_at) || 0,
        })),
        pagination,
      },
    });
    const fresh = Date.now();
    const rooms = res.rows.map((r) => {
      const createdAt = Number(r.created_at) || 0;
      return {
        code: String(r.code),
        username: String(r.p1_username || ''),
        createdAt,
        expiresAt: createdAt + WAITING_TTL_MS,
        secondsLeft: Math.max(0, Math.ceil((createdAt + WAITING_TTL_MS - fresh) / 1000)),
        isMine: String(r.p1_id) === String(session.id),
      };
    });
    return jsonOk({
      rooms,
      pagination,
      q,
    });
  } catch (e) {
    console.error('[BATTLE ROOMS]', e.message);
    return jsonFail('Gagal memuat battle ready.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/battle/rooms/route.js' });
