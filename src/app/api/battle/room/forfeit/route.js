import { ensureBattleRooms, getRoom, getRoomCached, saveRoom, surrender, finishIfOver, sideOf } from '@/lib/rooms';
import { bumpRoom } from '@/lib/roomEvents';
import { parseJson, jsonOk, jsonFail, apiHandler, WRITE_TIMEOUT_MS } from '@/lib/apiHandler';

// POST /api/battle/room/forfeit { code } — menyerah manual, game langsung berakhir.
async function POST_impl(req, _ctx, session) {
  const { body, error: bodyErr } = await parseJson(req);
  if (bodyErr) return bodyErr;
  const code = String(body.code || '').replace(/[^0-9]/g, '');
  if (!code) return jsonFail('Kode wajib diisi.', 400);
  try {
    await ensureBattleRooms();
    const room = await getRoomCached(code);
    if (!room) return jsonFail('Room tidak ada.', 404);
    if (!sideOf(room, session.id)) {
      return jsonFail('Bukan room kamu.', 403);
    }
    const res = surrender(room, session.id);
    if (!res) return jsonFail('Battle sudah selesai.', 400);
    await finishIfOver(room);
    await saveRoom(room);
    bumpRoom(code);
    return jsonOk({ battle: room.battle, result: room.result, winner: room.winner });
  } catch (e) {
    console.error('[BATTLE FORFEIT]', e.message);
    return jsonFail('Gagal menyerah.', 500);
  }
}

// Batas hang server (penjaga Turso menggantung).
export const POST = apiHandler(POST_impl, { timeout: WRITE_TIMEOUT_MS, tag: 'src/app/api/battle/room/forfeit/route.js' });
