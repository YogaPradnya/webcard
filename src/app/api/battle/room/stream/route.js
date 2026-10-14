import { getSessionFromRequest } from '@/lib/session';
import {
  ensureBattleRooms,
  getRoom,
  saveRoom,
  applyTimeout,
  applyForfeit,
  finishIfOver,
  sideOf,
  publicState,
  isWaitingExpired,
} from '@/lib/rooms';
import {
  bumpRoom,
  addRoomListener,
  removeRoomListener,
  touchPresence,
  onlineIds,
  getRematchOffer,
} from '@/lib/roomEvents';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET /api/battle/room/stream?code=123456 — SSE: state terbaru + presence.
// Menggantikan polling 2.5 dtk untuk room PvP. Fallback klien ke polling
// bila EventSource gagal. Cek-DB berkala (5 dtk) sebagai jaring pengaman
// timeout/forfeit + bila bump antar-proses terlewat.
const HEARTBEAT_MS = 25 * 1000;
const DB_CHECK_MS = 5 * 1000;

export async function GET(req) {
  const session = getSessionFromRequest(req);
  if (!session) {
    return new Response(JSON.stringify({ success: false, message: 'Belum login.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const code = new URL(req.url).searchParams.get('code') || '';
  try {
    await ensureBattleRooms();
  } catch {
    return new Response(JSON.stringify({ success: false, message: 'DB belum siap.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let onBump = null;
  let hbTimer = null;
  let dbTimer = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      async function snapshot() {
        try {
          const room = await getRoom(code);
          if (!room) return { gone: true };
          if (isWaitingExpired(room)) return { gone: true, expired: true };
          let changed = false;
          if (applyTimeout(room, Date.now())) changed = true;
          if (applyForfeit(room, Date.now())) changed = true;
          const fin = await finishIfOver(room);
          if (fin.finished && !room.result) changed = true;
          if (changed || fin.finished) {
            await saveRoom(room);
            bumpRoom(code);
          }
          touchPresence(code, session.id);
          return {
            state: publicState(room, session.id),
            online: onlineIds(code),
            rematch: getRematchOffer(code),
          };
        } catch {
          return { error: true };
        }
      }

      // Validasi awal: room ada + milik peserta.
      const first = await getRoom(code);
      if (!first || !sideOf(first, session.id)) {
        send('error', { success: false, message: !first ? 'Room tidak ada.' : 'Bukan room kamu.' });
        try { controller.close(); } catch { /* abaikan */ }
        closed = true;
        return;
      }
      touchPresence(code, session.id);

      const push = async () => {
        const snap = await snapshot();
        if (snap.gone) {
          send('gone', { success: false, expired: Boolean(snap.expired) });
          cleanup();
          try { controller.close(); } catch { /* abaikan */ }
          closed = true;
          return;
        }
        if (!snap.error) send('state', snap);
      };

      onBump = () => { push(); };
      addRoomListener(code, onBump);
      send('ready', { success: true, code });
      await push();

      hbTimer = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          closed = true;
        }
        touchPresence(code, session.id);
      }, HEARTBEAT_MS);
      dbTimer = setInterval(() => {
        if (!closed) push();
      }, DB_CHECK_MS);

      function cleanup() {
        if (onBump) removeRoomListener(code, onBump);
        onBump = null;
        if (hbTimer) clearInterval(hbTimer);
        if (dbTimer) clearInterval(dbTimer);
        hbTimer = dbTimer = null;
      }

      req.signal?.addEventListener('abort', () => {
        closed = true;
        cleanup();
        try { controller.close(); } catch { /* abaikan */ }
      });
    },
    cancel() {
      closed = true;
      if (onBump) removeRoomListener(code, onBump);
      if (hbTimer) clearInterval(hbTimer);
      if (dbTimer) clearInterval(dbTimer);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
