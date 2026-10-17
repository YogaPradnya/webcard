import { getDb } from '@/lib/db';
import { getCardStatsMap } from '@/lib/cards';
import { createBattle } from '@/lib/engine';
import {
  ensureBattleRooms,
  genRoomCode,
  getRoom,
  getRoomCached,
  saveRoom,
  applyTimeout,
  applyForfeit,
  finishIfOver,
  playAiTurns,
  sideOf,
  publicState,
  isWaitingExpired,
  deleteRoom,
  maybeCleanupRooms,
} from '@/lib/rooms';
import { bumpRoom } from '@/lib/roomEvents';
import { apiHandler, jsonOk, jsonFail, parseJson, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';




async function validateTeam(db, userId, team) {
  if (!Array.isArray(team) || team.length !== 3) return 'Pilih 3 kartu berbeda.';
  const names = team.map((n) => String(n || '').trim()).filter(Boolean);
  if (names.length !== 3 || new Set(names.map((n) => n.toLowerCase())).size !== 3) {
    return 'Pilih 3 kartu berbeda.';
  }
  const ownedRes = await db.execute({
    sql: 'SELECT char_name, rarity, level FROM user_cards WHERE user_id = ?',
    args: [String(userId)],
  });
  const ownedMap = {};
  for (const r of ownedRes.rows) {
    ownedMap[String(r.char_name || '').toLowerCase()] = {
      rarity: String(r.rarity || 'Common'),
      level: Number(r.level) || 1,
    };
  }
  // Cek pajangan paralel (1 gelombang, bukan 3 berurutan ke Tokyo).
  const dispChecks = await Promise.all(names.map((n) =>
    db.execute({
      sql: 'SELECT id FROM user_display_cards WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1',
      args: [String(userId), n],
    }).catch(() => ({ rows: [] })),
  ));
  for (let i = 0; i < names.length; i++) {
    if (!ownedMap[names[i].toLowerCase()]) return `Kamu tidak punya ${names[i]}.`;
    if ((dispChecks[i].rows || []).length > 0) return `${names[i]} adalah kartu pajangan, tidak bisa dipakai battle.`;
  }
  return null;
}

async function teamLevels(db, userId, team) {
  try {
    const res = await db.execute({
      sql: 'SELECT char_name, rarity, level FROM user_cards WHERE user_id = ?',
      args: [String(userId)],
    });
    const map = {};
    for (const r of res.rows) {
      map[String(r.char_name || '').toLowerCase()] = {
        tier: String(r.rarity || 'Common'),
        level: Number(r.level) || 1,
      };
    }
    return team.map((n) => map[String(n || '').toLowerCase()] || { tier: 'Common', level: 1 });
  } catch {
    return team.map(() => ({ tier: 'Common', level: 1 }));
  }
}

// POST /api/battle/room { mode: 'ai' | 'pvp', team: [3 nama] } — buat room + kode angka.
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const mode = body.mode === 'pvp' ? 'pvp' : 'ai';
  const difficulty = ['easy', 'normal', 'hard'].includes(body.difficulty) ? body.difficulty : 'normal';

  try {
    await ensureBattleRooms();
    await maybeCleanupRooms(Date.now());
    const db = getDb();
    const err = await validateTeam(db, session.id, body.team);
    if (err) return jsonFail(err, 400);

    const statsMap = await getCardStatsMap();
    const withName = (key, fallback) => {
      const st = statsMap[String(key).toLowerCase()];
      if (!st) return null;
      return { ...st, name: st.name || fallback };
    };
    const scaleEnemy = (s) => {
      if (difficulty === 'easy') return { ...s, hp: Math.round(s.hp * 0.8), basic: Math.max(1, Math.round(s.basic * 0.85)), skill: Math.max(1, Math.round(s.skill * 0.85)) };
      if (difficulty === 'hard') return { ...s, hp: Math.round(s.hp * 1.2), basic: Math.round(s.basic * 1.1), skill: Math.round(s.skill * 1.1) };
      return s;
    };
    const p1Stats = body.team.map((n) => withName(n, n)).filter(Boolean);
    if (p1Stats.length !== 3) {
      return jsonFail('Stat kartu tidak lengkap.', 500);
    }

    let code = '';
    for (let i = 0; i < 10; i++) {
      const cand = genRoomCode();
      if (!(await getRoom(cand))) {
        code = cand;
        break;
      }
    }
    if (!code) return jsonFail('Gagal buat room.', 500);

    const now = Date.now();
    if (mode === 'ai') {
      const poolKeys = Object.keys(statsMap);
      const enemyStats = [...poolKeys]
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((k) => scaleEnemy(withName(k, k)))
        .filter(Boolean);
      if (enemyStats.length !== 3) {
        return jsonFail('Gagal susun tim AI.', 500);
      }
      const first = Math.random() < 0.5 ? 'player' : 'enemy';
      const battle = createBattle(
        p1Stats.map((s) => ({ ...s })),
        enemyStats.map((s) => ({ ...s })),
        first,
      );
      const room = {
        code,
        mode,
        p1Id: String(session.id),
        p1Username: String(session.username || ''),
        p2Id: null,
        p2Username: 'AI',
        p1Team: p1Stats,
        battle,
        turn: first === 'player' ? String(session.id) : 'AI',
        status: 'ongoing',
        winner: null,
        result: null,
        xpPaid: false,
        updatedAt: now,
      };
      playAiTurns(room);
      await db.execute({
        sql: `INSERT INTO battle_rooms (code, mode, p1_id, p1_username, p2_username, p1_team, state, turn, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [code, mode, room.p1Id, room.p1Username, room.p2Username, JSON.stringify(p1Stats),
          JSON.stringify(battle), room.turn, room.status, now, now],
      });
      const saved = await getRoom(code);
      return jsonOk({ state: publicState(saved, session.id) });
    }

    // PvP: tunggu lawan join.
    await db.execute({
      sql: `INSERT INTO battle_rooms (code, mode, p1_id, p1_username, p1_team, state, turn, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [code, mode, String(session.id), String(session.username || ''), JSON.stringify(p1Stats),
        '{}', null, 'waiting', now, now],
    });
    const saved = await getRoom(code);
    bumpRoom(code);
    return jsonOk({ state: publicState(saved, session.id) });
  } catch (e) {
    console.error('[BATTLE ROOM]', e.message);
    return jsonFail('Gagal buat room.', 500);
  }
}

// GET /api/battle/room?code=123456 — state terbaru (polling).
async function GET_impl(req, _ctx, session) {
  const code = new URL(req.url).searchParams.get('code') || '';

  try {
    await ensureBattleRooms();
    const room = await getRoomCached(code);
    if (!room) return jsonFail('Room tidak ada.', 404);
    if (isWaitingExpired(room)) {
      await deleteRoom(room.code);
      return jsonFail('Kode hangus (5 menit). Buat room baru.', 410);
    }
    if (!sideOf(room, session.id)) {
      return jsonFail('Bukan room kamu.', 403);
    }
    let changed = false;
    if (applyTimeout(room, Date.now())) changed = true;
    if (applyForfeit(room, Date.now())) changed = true;
    const fin = await finishIfOver(room);
    if (fin.finished && !room.result) changed = true;
    if (changed || fin.finished) await saveRoom(room);
    return jsonOk({ state: publicState(room, session.id) });
  } catch (e) {
    console.error('[BATTLE STATE]', e.message);
    return jsonFail('Gagal memuat room.', 500);
  }
}

// DELETE /api/battle/room?code=123456 — batalkan room waiting milik sendiri.
async function DELETE_impl(req, _ctx, session) {
  const code = new URL(req.url).searchParams.get('code') || '';
  try {
    await ensureBattleRooms();
    const room = await getRoom(code);
    if (!room) return jsonOk();
    if (String(room.p1Id) !== String(session.id)) {
      return jsonFail('Bukan room kamu.', 403);
    }
    if (room.status !== 'waiting') {
      return jsonFail('Battle sudah mulai, tidak bisa dibatalkan.', 400);
    }
    await deleteRoom(room.code);
    return jsonOk();
  } catch (e) {
    console.error('[BATTLE CANCEL]', e.message);
    return jsonFail('Gagal membatalkan room.', 500);
  }
}

// Auth + batas hang server via apiHandler (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/battle/room/route.js' });
export const GET = apiHandler(GET_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/battle/room/route.js' });
export const DELETE = apiHandler(DELETE_impl, { timeout: READ_TIMEOUT_MS, tag: 'src/app/api/battle/room/route.js' });
