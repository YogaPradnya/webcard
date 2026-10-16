import { getDb } from '@/lib/db';
import { getCardStatsMap } from '@/lib/cards';
import { createBattle } from '@/lib/engine';
import { ensureBattleRooms, getRoom, getRoomCached, saveRoom, isWaitingExpired, deleteRoom, cleanupExpiredWaitingRooms, forfeitMsLeft, FORFEIT_TIMEOUT_MS } from '@/lib/rooms';
import { bumpRoom } from '@/lib/roomEvents';
import { checkRateCount } from '@/lib/rateLimit';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/battle/room/join { code, team: [3 nama] } — gabung room PvP.
async function POST_impl(req, _ctx, session) {

  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const code = String(body.code || '').replace(/[^0-9]/g, '');
  const team = Array.isArray(body.team) ? body.team.map((n) => String(n || '').trim()).filter(Boolean) : [];
  if (!code || team.length !== 3 || new Set(team.map((n) => n.toLowerCase())).size !== 3) {
    return jsonFail('Kode dan 3 kartumu wajib diisi.', 400);
  }
  const attempt = await checkRateCount(`join:${session.id}`, 20, 60 * 1000);
  if (!attempt.ok) {
    return jsonFail('Terlalu banyak percobaan. Tunggu sebentar.', 429);
  }

  try {
    await ensureBattleRooms();
    await cleanupExpiredWaitingRooms(Date.now());
    const db = getDb();
    const room = await getRoomCached(code);
    if (!room || room.mode !== 'pvp' || room.status !== 'waiting') {
      return jsonFail('Room tidak tersedia.', 404);
    }
    if (isWaitingExpired(room)) {
      await deleteRoom(room.code);
      return jsonFail('Kode hangus (5 menit). Minta lawan buat baru.', 410);
    }
    if (String(room.p1Id) === String(session.id)) {
      return jsonFail('Tidak bisa gabung room sendiri.', 400);
    }

    const ownedRes = await db.execute({
      sql: 'SELECT char_name FROM user_cards WHERE user_id = ?',
      args: [String(session.id)],
    });
    const ownedSet = new Set(ownedRes.rows.map((r) => String(r.char_name || '').toLowerCase()));
    for (const n of team) {
      if (!ownedSet.has(n.toLowerCase())) {
        return jsonFail(`Kamu tidak punya ${n}.`, 400);
      }
    }

    const statsMap = await getCardStatsMap();
    const withName = (key, fallback) => {
      const st = statsMap[String(key).toLowerCase()];
      if (!st) return null;
      return { ...st, name: st.name || fallback };
    };
    const p1Stats = room.p1Team.map((s) => ({ ...s }));
    const p2Stats = team.map((n) => withName(n, n)).filter(Boolean);
    if (p1Stats.length !== 3 || p2Stats.length !== 3) {
      return jsonFail('Stat kartu tidak lengkap.', 500);
    }

    const first = Math.random() < 0.5 ? 'player' : 'enemy';
    room.battle = createBattle(p1Stats, p2Stats, first);
    room.p2Id = String(session.id);
    room.p2Username = String(session.username || '');
    room.turn = first === 'player' ? room.p1Id : room.p2Id;
    room.status = 'ongoing';
    await saveRoom(room);
    bumpRoom(code);

    const saved = await getRoomCached(code);
    return jsonOk({
      state: {
        code: saved.code,
        mode: saved.mode,
        status: saved.status,
        turn: saved.turn,
        you: String(session.id),
        yourSide: 'enemy',
        p1Username: saved.p1Username,
        p2Username: saved.p2Username,
        battle: saved.battle,
        winner: saved.winner,
        result: saved.result,
        updatedAt: saved.updatedAt,
        forfeitMsLeft: forfeitMsLeft(saved, Date.now()),
        forfeitTimeoutMs: FORFEIT_TIMEOUT_MS,
      },
    });
  } catch (e) {
    console.error('[BATTLE JOIN]', e.message);
    return jsonFail('Gagal gabung room.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/battle/room/join/route.js' });
