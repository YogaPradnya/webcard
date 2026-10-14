import { NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/session';
import { ensureBattleRooms, getRoom, saveRoom, surrender, finishIfOver, sideOf } from '@/lib/rooms';
import { bumpRoom } from '@/lib/roomEvents';

// POST /api/battle/room/forfeit { code } — menyerah manual, game langsung berakhir.
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
  if (!code) return NextResponse.json({ success: false, message: 'Kode wajib diisi.' }, { status: 400 });
  try {
    await ensureBattleRooms();
    const room = await getRoom(code);
    if (!room) return NextResponse.json({ success: false, message: 'Room tidak ada.' }, { status: 404 });
    if (!sideOf(room, session.id)) {
      return NextResponse.json({ success: false, message: 'Bukan room kamu.' }, { status: 403 });
    }
    const res = surrender(room, session.id);
    if (!res) return NextResponse.json({ success: false, message: 'Battle sudah selesai.' }, { status: 400 });
    await finishIfOver(room);
    await saveRoom(room);
    bumpRoom(code);
    return NextResponse.json({ success: true, battle: room.battle, result: room.result, winner: room.winner });
  } catch (e) {
    console.error('[BATTLE FORFEIT]', e.message);
    return NextResponse.json({ success: false, message: 'Gagal menyerah.' }, { status: 500 });
  }
}
