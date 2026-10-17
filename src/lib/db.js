import { createClient } from '@libsql/client';

let client = null;

// Klien Turso (HTTP, aman untuk serverless). DB SAMA dengan bot agar koleksi nyambung.
export function getDb() {
  if (client) return client;
  const url = process.env.TURSO_URL || '';
  const authToken = process.env.TURSO_AUTH_TOKEN || '';
  if (!url) throw new Error('TURSO_URL belum diisi di .env.local');
  client = createClient({ url, authToken });
  return client;
}

// Turso (insiden 17 Okt): transaksi TULIS pertama per client bisa macet
// 12-35 dtk (akuisisi write-lock pertama); transaksi berikutnya <1 dtk.
// Satu-satunya pemakai transaction() adalah trade (butuh all-or-nothing),
// jadi panaskan sekali saat boot agar user tidak kena stall.
let _warmPromise = null;
export function warmWriteTxOnce() {
  if (_warmPromise) return _warmPromise;
  _warmPromise = (async () => {
    try {
      const tx = await getDb().transaction('write');
      // Tulis nyata tapi aman (nilai sama) — no-op mungkin tak ambil write-lock.
      await tx.execute('INSERT OR REPLACE INTO schema_version (version, applied_at) SELECT version, applied_at FROM schema_version');
      await tx.commit();
      console.log('[DB] warm-up write tx selesai');
    } catch (e) {
      console.error('[DB] warm-up write tx gagal (akan dicoba lagi):', String(e?.message || e));
      _warmPromise = null; // jangan cache kegagalan — panggilan berikutnya retry
    }
  })();
  return _warmPromise;
}

export async function readSetting(key) {
  try {
    const res = await getDb().execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] });
    if (res.rows.length > 0 && res.rows[0].value != null) return String(res.rows[0].value);
  } catch {
    // tabel settings belum ada -> null (fallback default)
  }
  return null;
}
