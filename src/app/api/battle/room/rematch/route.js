import { getDb } from '@/lib/db';
import { getCardStatsMap } from '@/lib/cards';
import {
  ensureBattleRooms,
  genRoomCode,
  getRoom,
  getRoomCached,
  sideOf,
  sideTeamNames,
} from '@/lib/rooms';
import { bumpRoom } from '@/lib/roomEvents';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/battle/room/rematch { code } — tantang rematch dari room PvP yang selesai.
// Membuat room waiting baru (penantang = p1 + tim lamanya), lalu bump room lama
// dengan tawaran { code } agar lawan menerima via SSE. Lawan gabung dengan
// endpoint join biasa (boleh ganti tim).
async function POST_impl(req, _ctx, session) {

  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const code = String(body.code || '').replace(/[^0-9]/g, '');
  if (!code) return jsonFail('Kode wajib diisi.', 400);

  try {
    await ensureBattleRooms();
    const room = await getRoomCached(code);
    if (!room) return jsonFail('Room tidak ada.', 404);
    if (room.mode !== 'pvp') {
      return jsonFail('Rematch hanya untuk PvP.', 400);
    }
    if (!sideOf(room, session.id)) {
      return jsonFail('Bukan room kamu.', 403);
    }
    if (room.status !== 'finished' && !room.battle?.over) {
      return jsonFail('Battle belum selesai.', 400);
    }
    const team = sideTeamNames(room, session.id);
    if (team.length !== 3) {
      return jsonFail('Tim lama tidak lengkap.', 400);
    }

    const db = getDb();
    // Ambil stat terbaru tim penantang (level/XP bisa berubah sejak battle lama).
    // p1_team disimpan sebagai objek stat lengkap seperti flow create.
    const ownedRes = await db.execute({
      sql: 'SELECT char_name, rarity, level FROM user_cards WHERE user_id = ?',
      args: [String(session.id)],
    });
    const ownedMap = {};
    for (const r of ownedRes.rows) {
      ownedMap[String(r.char_name || '').toLowerCase()] = {
        tier: String(r.rarity || 'Common'),
        level: Number(r.level) || 1,
      };
    }
    const statsMap = await getCardStatsMap();
    const p1Stats = [];
    for (const n of team) {
      const owned = ownedMap[n.toLowerCase()];
      if (!owned) {
        return jsonFail(`Kartu ${n} sudah tidak kamu miliki.`, 400);
      }
      const st = statsMap[n.toLowerCase()];
      if (!st) {
        return jsonFail(`Stat ${n} tidak lengkap.`, 500);
      }
      p1Stats.push({ ...st, name: st.name || n, tier: owned.tier, level: owned.level });
    }
    if (p1Stats.length !== 3) {
      return jsonFail('Tim lama tidak lengkap.', 500);
    }

    let newCode = '';
    for (let i = 0; i < 10; i++) {
      const cand = genRoomCode();
      if (!(await getRoom(cand))) {
        newCode = cand;
        break;
      }
    }
    if (!newCode) return jsonFail('Gagal buat room.', 500);

    const now = Date.now();
    await db.execute({
      sql: `INSERT INTO battle_rooms (code, mode, p1_id, p1_username, p1_team, state, turn, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [newCode, 'pvp', String(session.id), String(session.username || ''), JSON.stringify(p1Stats),
        '{}', null, 'waiting', now, now],
    });
    bumpRoom(newCode);
    bumpRoom(code, { rematch: { code: newCode, from: String(session.username || ''), at: now } });
    return jsonOk({ code: newCode });
  } catch (e) {
    console.error('[BATTLE REMATCH]', e.message);
    return jsonFail('Gagal membuat rematch.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/battle/room/rematch/route.js' });
