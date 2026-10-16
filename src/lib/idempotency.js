import { getDb } from './db.js';
import { isSchemaReady } from './schema.js';

// Idempotency untuk POST mutasi: klien kirim `Idempotency-Key` (UUID per klik).
// Key yang sama dari user yang sama untuk route yang sama mengembalikan
// respons tersimpan tanpa mengeksekusi ulang. TTL 24 jam.
// Tanpa header -> perilaku lama (tidak ada proteksi, tetap jalan).

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BODY_CHARS = 20000;

function sanitizeKey(v) {
  const s = String(v || '').trim().slice(0, 64);
  if (!s) return '';
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return '';
  return s;
}

export function getIdempotencyKey(req) {
  try {
    return sanitizeKey(req.headers.get('idempotency-key'));
  } catch {
    return '';
  }
}

export async function ensureIdempotencyTable() {
  if (isSchemaReady()) return; // DDL sudah diurus migrasi 009 (0 round-trip).
  await getDb().execute(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      route TEXT NOT NULL,
      status INTEGER NOT NULL,
      response TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      PRIMARY KEY (key, user_id, route)
    )
  `);
  await getDb().execute('CREATE INDEX IF NOT EXISTS idx_idem_user_created ON idempotency_keys (user_id, created_at DESC)').catch(() => {});
}

// Cek replay: return { hit:true, status, body } atau { hit:false }.
// Entri kedaluwarsa dianggap tidak ada (dibersihkan oportunistik saat save).
export async function checkIdempotency(db, key, userId, route, now = Date.now()) {
  if (!key) return { hit: false };
  try {
    const res = await db.execute({
      sql: 'SELECT status, response, created_at FROM idempotency_keys WHERE key = ? AND user_id = ? AND route = ?',
      args: [key, String(userId), String(route)],
    });
    if (res.rows.length === 0) return { hit: false };
    const r = res.rows[0];
    if (now - (Number(r.created_at) || 0) > IDEMPOTENCY_TTL_MS) return { hit: false };
    let body = {};
    try {
      body = JSON.parse(String(r.response || '{}')) || {};
    } catch {
      return { hit: false };
    }
    return { hit: true, status: Number(r.status) || 200, body };
  } catch {
    return { hit: false }; // fail-open: proteksi mati, request tetap jalan
  }
}

// Simpan hasil sukses mutasi. Best-effort: gagal simpan tidak menggagalkan request.
export async function saveIdempotency(db, key, userId, route, status, body, now = Date.now()) {
  if (!key) return;
  try {
    const text = JSON.stringify(body ?? {}).slice(0, MAX_BODY_CHARS);
    await db.execute({
      sql: 'INSERT OR REPLACE INTO idempotency_keys (key, user_id, route, status, response, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [key, String(userId), String(route), Number(status) || 200, text, now],
    });
  } catch { /* abaikan */ }
  try {
    await db.execute({
      sql: 'DELETE FROM idempotency_keys WHERE created_at < ?',
      args: [now - IDEMPOTENCY_TTL_MS],
    });
  } catch { /* abaikan */ }
}
