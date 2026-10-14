// Event bus realtime room battle (in-memory, per proses).
// Dipakai SSE stream: route act/join/forfeit/rematch memanggil bumpRoom()
// setelah saveRoom, semua stream yang terhubung ke room itu langsung
// menerima state terbaru tanpa polling.
// Catatan: bila Coolify dijalankan >1 replika, bump antar-proses tidak
// diteruskan — stream route punya fallback cek-DB berkala (3 dtk) sehingga
// update tetap sampai maksimal selisih interval itu.

const rooms = new Map(); // code -> { version, listeners: Set<fn>, presence: Map<userId, ts>, rematch: object|null }

const PRESENCE_TTL_MS = 45 * 1000;
const IDLE_TTL_MS = 10 * 60 * 1000;
let lastSweep = 0;

function entry(code) {
  let e = rooms.get(String(code));
  if (!e) {
    e = { version: 0, listeners: new Set(), presence: new Map(), rematch: null, lastTouch: Date.now() };
    rooms.set(String(code), e);
  }
  e.lastTouch = Date.now();
  return e;
}

function sweep(now = Date.now()) {
  if (now - lastSweep < 60 * 1000) return;
  lastSweep = now;
  for (const [code, e] of rooms) {
    if (e.listeners.size === 0 && now - e.lastTouch > IDLE_TTL_MS) rooms.delete(code);
    else {
      for (const [uid, ts] of e.presence) {
        if (now - ts > PRESENCE_TTL_MS) e.presence.delete(uid);
      }
    }
  }
}

// Naikkan versi + siarkan ke semua listener. extra = info tambahan sekali-kirim (mis. rematch).
export function bumpRoom(code, extra = null) {
  const e = entry(code);
  e.version += 1;
  if (extra && extra.rematch) e.rematch = extra.rematch;
  for (const fn of [...e.listeners]) {
    try { fn(e.version); } catch { /* abaikan listener rusak */ }
  }
  sweep();
  return e.version;
}

export function roomVersion(code) {
  return rooms.get(String(code))?.version || 0;
}

export function addRoomListener(code, fn) {
  entry(code).listeners.add(fn);
}

export function removeRoomListener(code, fn) {
  const e = rooms.get(String(code));
  if (e) e.listeners.delete(fn);
  sweep();
}

export function touchPresence(code, userId) {
  if (userId == null) return;
  entry(code).presence.set(String(userId), Date.now());
}

export function onlineIds(code, now = Date.now()) {
  const e = rooms.get(String(code));
  if (!e) return [];
  const out = [];
  for (const [uid, ts] of e.presence) {
    if (now - ts <= PRESENCE_TTL_MS) out.push(uid);
  }
  return out;
}

// Tawaran rematch yang belum diambil (dibersihkan saat room sepi).
export function getRematchOffer(code) {
  return rooms.get(String(code))?.rematch || null;
}

export function clearRematchOffer(code) {
  const e = rooms.get(String(code));
  if (e) e.rematch = null;
}
