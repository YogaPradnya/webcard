import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { getCardStatsMap } from '@/lib/cards';
import { createBattle } from '@/lib/engine';
import {
  ensureBattleRooms,
  genRoomCode,
  getRoom,
  saveRoom,
  applyTimeout,
  applyForfeit,
  finishIfOver,
  playAiTurns,
  sideOf,
  publicState,
  isWaitingExpired,
  deleteRoom,
  cleanupExpiredWaitingRooms,
} from '@/lib/rooms';
import { bumpRoom } from '@/lib/roomEvents';

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
  for (const n of names) {
    const owned = ownedMap[n.toLowerCase()];
    if (!owned) return `Kamu tidak punya ${n}.`;
    // Kartu pajangan (display-only) tidak bisa dipakai battle.
    try {
      const disp = await db.execute({
        sql: 'SELECT id FROM user_display_cards WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1',
        args: [String(userId), n],
      });
      if (disp.rows.length > 0) return `${n} adalah kartu pajangan, tidak bisa dipakai battle.`;
    } catch { /* tabel belum ada -> abaikan */ }
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
export async function POST(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });

  let body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Body JSON tidak valid.' }, { status: 400 });
  }
  const mode = body.mode === 'pvp' ? 'pvp' : 'ai';
  const difficulty = ['easy', 'normal', 'hard'].includes(body.difficulty) ? body.difficulty : 'normal';

  try {
    await ensureBattleRooms();
    await cleanupExpiredWaitingRooms(Date.now());
    const db = getDb();
    const err = await validateTeam(db, session.id, body.team);
    if (err) return NextResponse.json({ success: false, message: err }, { status: 400 });

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
      return NextResponse.json({ success: false, message: 'Stat kartu tidak lengkap.' }, { status: 500 });
    }

    let code = '';
    for (let i = 0; i < 10; i++) {
      const cand = genRoomCode();
      if (!(await getRoom(cand))) {
        code = cand;
        break;
      }
    }
    if (!code) return NextResponse.json({ success: false, message: 'Gagal buat room.' }, { status: 500 });

    const now = Date.now();
    if (mode === 'ai') {
      const poolKeys = Object.keys(statsMap);
      const enemyStats = [...poolKeys]
        .sort(() => Math.random() - 0.5)
        .slice(0, 3)
        .map((k) => scaleEnemy(withName(k, k)))
        .filter(Boolean);
      if (enemyStats.length !== 3) {
        return NextResponse.json({ success: false, message: 'Gagal susun tim AI.' }, { status: 500 });
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
      return NextResponse.json({ success: true, state: publicState(saved, session.id) });
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
    return NextResponse.json({ success: true, state: publicState(saved, session.id) });
  } catch (e) {
    console.error('[BATTLE ROOM]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal buat room.' }, { status: 500 });
  }
}

// GET /api/battle/room?code=123456 — state terbaru (polling).
export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  const code = new URL(req.url).searchParams.get('code') || '';

  try {
    await ensureBattleRooms();
    const room = await getRoom(code);
    if (!room) return NextResponse.json({ success: false, message: 'Room tidak ada.' }, { status: 404 });
    if (isWaitingExpired(room)) {
      await deleteRoom(room.code);
      return NextResponse.json({ success: false, message: 'Kode hangus (5 menit). Buat room baru.' }, { status: 410 });
    }
    if (!sideOf(room, session.id)) {
      return NextResponse.json({ success: false, message: 'Bukan room kamu.' }, { status: 403 });
    }
    let changed = false;
    if (applyTimeout(room, Date.now())) changed = true;
    if (applyForfeit(room, Date.now())) changed = true;
    const fin = await finishIfOver(room);
    if (fin.finished && !room.result) changed = true;
    if (changed || fin.finished) await saveRoom(room);
    return NextResponse.json({ success: true, state: publicState(room, session.id) });
  } catch (e) {
    console.error('[BATTLE STATE]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal memuat room.' }, { status: 500 });
  }
}

// DELETE /api/battle/room?code=123456 — batalkan room waiting milik sendiri.
export async function DELETE(req) {
  const session = getSessionFromRequest(req);
  if (!session) return NextResponse.json({ success: false, message: 'Belum login.' }, { status: 401 });
  const code = new URL(req.url).searchParams.get('code') || '';
  try {
    await ensureBattleRooms();
    const room = await getRoom(code);
    if (!room) return NextResponse.json({ success: true });
    if (String(room.p1Id) !== String(session.id)) {
      return NextResponse.json({ success: false, message: 'Bukan room kamu.' }, { status: 403 });
    }
    if (room.status !== 'waiting') {
      return NextResponse.json({ success: false, message: 'Battle sudah mulai, tidak bisa dibatalkan.' }, { status: 400 });
    }
    await deleteRoom(room.code);
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[BATTLE CANCEL]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal membatalkan room.' }, { status: 500 });
  }
}
