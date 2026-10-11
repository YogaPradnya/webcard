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

export async function readSetting(key) {
  try {
    const res = await getDb().execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] });
    if (res.rows.length > 0 && res.rows[0].value != null) return String(res.rows[0].value);
  } catch {
    // tabel settings belum ada -> null (fallback default)
  }
  return null;
}
