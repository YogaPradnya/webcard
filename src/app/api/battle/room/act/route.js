import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { act as engineAct } from '@/lib/engine';
import {
  ensureBattleRooms,
  getRoom,
  saveRoom,
  applyTimeout,
  applyForfeit,
  finishIfOver,
  playAiTurns,
  sideOf,
} from '@/lib/rooms';

// POST /api/battle/room/act { code, action: {type, target?, ally?} } — 1 aksi giliranmu.
// type: basic|skill|skill2|switch. target = index kartu AKTIF lawan (ofensif),
// ally = index kartu tim sendiri (heal/shield manual).
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
  const action = body.action || {};
  if (!['basic', 'skill', 'skill2', 'switch'].includes(action?.type)) {
    return NextResponse.json({ success: false, message: 'Aksi tidak dikenal.' }, { status: 400 });
  }

  try {
    await ensureBattleRooms();
    const room = await getRoom(code);
    if (!room) return NextResponse.json({ success: false, message: 'Room tidak ada.' }, { status: 404 });
    const side = sideOf(room, session.id);
    if (!side) return NextResponse.json({ success: false, message: 'Bukan room kamu.' }, { status: 403 });

    applyTimeout(room, Date.now());
    applyForfeit(room, Date.now());
    if (room.status !== 'ongoing' || room.battle.over) {
      await finishIfOver(room);
      await saveRoom(room);
      return NextResponse.json({ success: true, finished: true, battle: room.battle, result: room.result });
    }
    if (String(room.turn) !== String(session.id)) {
      return NextResponse.json({ success: false, message: 'Belum giliranmu.' }, { status: 403 });
    }

    const battle = room.battle;
    const from = battle.log.length;
    const ok = engineAct(battle, side, action);
    if (!ok) {
      return NextResponse.json({ success: false, message: 'Aksi ilegal (cons kurang / target salah).' }, { status: 400 });
    }

    if (!battle.over) {
      if (room.mode === 'ai') {
        room.turn = 'AI';
        playAiTurns(room);
        if (!battle.over) room.turn = String(session.id);
      } else {
        room.turn = side === 'player' ? String(room.p2Id) : String(room.p1Id);
      }
    }
    await finishIfOver(room);
    await saveRoom(room);
    return NextResponse.json({
      success: true,
      events: battle.log.slice(from),
      battle,
      finished: battle.over,
      result: room.result,
    });
  } catch (e) {
    console.error('[BATTLE ACT]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal menjalankan aksi.' }, { status: 500 });
  }
}
