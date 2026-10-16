import { act as engineAct } from '@/lib/engine';
import {
  ensureBattleRooms,
  getRoom,
  getRoomCached,
  saveRoom,
  applyTimeout,
  applyForfeit,
  finishIfOver,
  playAiTurns,
  sideOf,
} from '@/lib/rooms';
import { bumpRoom } from '@/lib/roomEvents';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/battle/room/act { code, action: {type, target?, ally?} } — 1 aksi giliranmu.
// type: basic|skill|skill2|switch. target = index kartu AKTIF lawan (ofensif),
// ally = index kartu tim sendiri (heal/shield manual).
async function POST_impl(req, _ctx, session) {

  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const code = String(body.code || '').replace(/[^0-9]/g, '');
  const action = body.action || {};
  if (!['basic', 'skill', 'skill2', 'switch'].includes(action?.type)) {
    return jsonFail('Aksi tidak dikenal.', 400);
  }

  try {
    await ensureBattleRooms();
    const room = await getRoomCached(code);
    if (!room) return jsonFail('Room tidak ada.', 404);
    const side = sideOf(room, session.id);
    if (!side) return jsonFail('Bukan room kamu.', 403);

    applyTimeout(room, Date.now());
    applyForfeit(room, Date.now());
    if (room.status !== 'ongoing' || room.battle.over) {
      await finishIfOver(room);
      await saveRoom(room);
      bumpRoom(code);
      return jsonOk({ finished: true, battle: room.battle, result: room.result });
    }
    if (String(room.turn) !== String(session.id)) {
      return jsonFail('Belum giliranmu.', 403);
    }

    const battle = room.battle;
    const from = battle.log.length;
    const ok = engineAct(battle, side, action);
    if (!ok) {
      return jsonFail('Aksi ilegal (cons kurang / target salah).', 400);
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
    bumpRoom(code);
    return jsonOk({
      events: battle.log.slice(from),
      battle,
      finished: battle.over,
      result: room.result,
    });
  } catch (e) {
    console.error('[BATTLE ACT]', e.message);
    return jsonFail('Gagal menjalankan aksi.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/battle/room/act/route.js' });
