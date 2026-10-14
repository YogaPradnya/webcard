import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { getDb } from '@/lib/db';
import { getCardStatsMap } from '@/lib/cards';
import { createBattle } from '@/lib/engine';
import { ensureBattleRooms, getRoom, saveRoom, isWaitingExpired, deleteRoom, cleanupExpiredWaitingRooms, forfeitMsLeft, FORFEIT_TIMEOUT_MS } from '@/lib/rooms';
import { bumpRoom } from '@/lib/roomEvents';
import { checkRateCount } from '@/lib/rateLimit';

// POST /api/battle/room/join { code, team: [3 nama] } — gabung room PvP.
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
  const team = Array.isArray(body.team) ? body.team.map((n) => String(n || '').trim()).filter(Boolean) : [];
  if (!code || team.length !== 3 || new Set(team.map((n) => n.toLowerCase())).size !== 3) {
    return NextResponse.json({ success: false, message: 'Kode dan 3 kartumu wajib diisi.' }, { status: 400 });
  }
  const attempt = await checkRateCount(`join:${session.id}`, 20, 60 * 1000);
  if (!attempt.ok) {
    return NextResponse.json({ success: false, message: 'Terlalu banyak percobaan. Tunggu sebentar.' }, { status: 429 });
  }

  try {
    await ensureBattleRooms();
    await cleanupExpiredWaitingRooms(Date.now());
    const db = getDb();
    const room = await getRoom(code);
    if (!room || room.mode !== 'pvp' || room.status !== 'waiting') {
      return NextResponse.json({ success: false, message: 'Room tidak tersedia.' }, { status: 404 });
    }
    if (isWaitingExpired(room)) {
      await deleteRoom(room.code);
      return NextResponse.json({ success: false, message: 'Kode hangus (5 menit). Minta lawan buat baru.' }, { status: 410 });
    }
    if (String(room.p1Id) === String(session.id)) {
      return NextResponse.json({ success: false, message: 'Tidak bisa gabung room sendiri.' }, { status: 400 });
    }

    const ownedRes = await db.execute({
      sql: 'SELECT char_name FROM user_cards WHERE user_id = ?',
      args: [String(session.id)],
    });
    const ownedSet = new Set(ownedRes.rows.map((r) => String(r.char_name || '').toLowerCase()));
    for (const n of team) {
      if (!ownedSet.has(n.toLowerCase())) {
        return NextResponse.json({ success: false, message: `Kamu tidak punya ${n}.` }, { status: 400 });
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
      return NextResponse.json({ success: false, message: 'Stat kartu tidak lengkap.' }, { status: 500 });
    }

    const first = Math.random() < 0.5 ? 'player' : 'enemy';
    room.battle = createBattle(p1Stats, p2Stats, first);
    room.p2Id = String(session.id);
    room.p2Username = String(session.username || '');
    room.turn = first === 'player' ? room.p1Id : room.p2Id;
    room.status = 'ongoing';
    await saveRoom(room);
    bumpRoom(code);

    const saved = await getRoom(code);
    return NextResponse.json({
      success: true,
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
    return NextResponse.json({ success: false, message: 'Gagal gabung room.' }, { status: 500 });
  }
}
