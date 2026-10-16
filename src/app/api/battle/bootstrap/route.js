import { jsonOk, jsonFail, apiHandler, READ_TIMEOUT_MS } from '@/lib/apiHandler';
import { getDb } from '@/lib/db';
import {
  ensureBattleRooms,
  WAITING_TTL_MS,
  FORFEIT_TIMEOUT_MS,
  forfeitMsLeft,
  cleanupExpiredWaitingRooms,
} from '@/lib/rooms';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




const PAGE_SIZE = 10;

// Gabungan /rooms + /mine dalam 1 request (hemat separuh request idle lobby).
// Cache list publik 10 dtk + cleanup throttle 60 dtk (sama seperti rooms).
// Bagian mine user-specific TIDAK di-cache.
const _roomsCache = new Map(); // `${q}|${page}` -> { at, payload }
const ROOMS_TTL_MS = 10 * 1000;
let _lastCleanupAt = 0;
const CLEANUP_MIN_GAP_MS = 60 * 1000;

// GET /api/battle/bootstrap?q=&page= — { rooms, pagination, q, mine }.
async function GET_impl(req, _ctx, session) {
  const params = new URL(req.url).searchParams;
  const q = String(params.get('q') || '').trim().slice(0, 50);
  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  try {
    await ensureBattleRooms();
    const now = Date.now();
    if (now - _lastCleanupAt > CLEANUP_MIN_GAP_MS) {
      _lastCleanupAt = now;
      await cleanupExpiredWaitingRooms(now);
    }
    const minCreated = now - WAITING_TTL_MS;

    // ---- rooms publik (cache 10 dtk) ----
    let rooms;
    let pagination;
    const cacheKey = `${q}|${page}`;
    const hit = _roomsCache.get(cacheKey);
    if (hit && now - hit.at < ROOMS_TTL_MS) {
      rooms = hit.payload.rooms.map((r) => ({
        code: r.code,
        username: r.username,
        createdAt: r.createdAt,
        expiresAt: r.createdAt + WAITING_TTL_MS,
        secondsLeft: Math.max(0, Math.ceil((r.createdAt + WAITING_TTL_MS - now) / 1000)),
        isMine: String(r.p1_id) === String(session.id),
      }));
      pagination = hit.payload.pagination;
    } else {
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
      pagination = { page, limit: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
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
      rooms = res.rows.map((r) => {
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
    }

    // ---- mine (user-specific, tanpa cache) ----
    const mineRes = await getDb().execute({
      sql: `SELECT code, mode, p1_id, p1_username, p2_id, p2_username, state, turn, status, winner, result, created_at, updated_at
            FROM battle_rooms WHERE (p1_id = ? OR p2_id = ?) AND status IN ('waiting','ongoing')
            ORDER BY updated_at DESC LIMIT 5`,
      args: [String(session.id), String(session.id)],
    });
    const mine = mineRes.rows.map((r) => {
      let battle = {};
      let result = null;
      try { battle = JSON.parse(r.state || '{}'); } catch { battle = {}; }
      try { result = r.result ? JSON.parse(r.result) : null; } catch { result = null; }
      const createdAt = Number(r.created_at) || 0;
      const updatedAt = Number(r.updated_at) || 0;
      const yourSide = String(r.p1_id) === String(session.id) ? 'player' : 'enemy';
      const pseudo = { status: String(r.status || 'waiting'), battle, updatedAt };
      return {
        code: String(r.code),
        mode: String(r.mode || 'ai'),
        status: String(r.status || 'waiting'),
        turn: r.turn ? String(r.turn) : null,
        you: String(session.id),
        yourSide,
        p1Username: String(r.p1_username || ''),
        p2Username: String(r.p2_username || ''),
        battle,
        winner: r.winner ? String(r.winner) : null,
        result,
        createdAt,
        updatedAt,
        forfeitMsLeft: forfeitMsLeft(pseudo, now),
        forfeitTimeoutMs: FORFEIT_TIMEOUT_MS,
        expiresAt: createdAt + WAITING_TTL_MS,
        secondsLeft: Math.max(0, Math.ceil((createdAt + WAITING_TTL_MS - now) / 1000)),
      };
    });

    return jsonOk({ rooms, pagination, q, mine });
  } catch (e) {
    console.error('[BATTLE BOOTSTRAP]', e.message);
    return jsonFail('Gagal memuat lobby battle.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/battle/bootstrap/route.js' });
