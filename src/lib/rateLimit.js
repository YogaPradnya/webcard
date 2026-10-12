import { getDb } from './db.js';

// Rate-limit persisten via Turso (aman untuk restart & multi-instance).
// Return { ok } — ok=false bila masih dalam jeda.
export async function checkRate(key, windowMs) {
  const now = Date.now();
  try {
    await getDb().execute(`
      CREATE TABLE IF NOT EXISTS web_rate_limits (
        key TEXT PRIMARY KEY,
        ts INTEGER NOT NULL
      )
    `);
    const res = await getDb().execute({ sql: 'SELECT ts FROM web_rate_limits WHERE key = ?', args: [String(key)] });
    if (res.rows.length > 0 && now - (Number(res.rows[0].ts) || 0) < windowMs) {
      return { ok: false };
    }
    await getDb().execute({
      sql: `INSERT INTO web_rate_limits (key, ts) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET ts = excluded.ts`,
      args: [String(key), now],
    });
    return { ok: true };
  } catch {
    // DB gagal -> izinkan (fail-open) agar fitur tidak mati total.
    return { ok: true };
  }
}

// Rate-limit hitungan: maks N aksi per windowMs (untuk anti tebak kode).
// Return { ok, remaining }.
export async function checkRateCount(key, maxHits, windowMs) {
  const now = Date.now();
  const windowStart = now - windowMs;
  try {
    await getDb().execute(`
      CREATE TABLE IF NOT EXISTS web_rate_counts (
        key TEXT NOT NULL,
        ts INTEGER NOT NULL
      )
    `);
    await getDb().execute({ sql: 'CREATE INDEX IF NOT EXISTS idx_rate_counts ON web_rate_counts (key, ts)' });
    await getDb().execute({ sql: 'DELETE FROM web_rate_counts WHERE ts < ?', args: [windowStart - windowMs] });
    const res = await getDb().execute({
      sql: 'SELECT COUNT(*) AS c FROM web_rate_counts WHERE key = ? AND ts >= ?',
      args: [String(key), windowStart],
    });
    const used = Number(res.rows[0]?.c || 0);
    if (used >= maxHits) return { ok: false, remaining: 0 };
    await getDb().execute({ sql: 'INSERT INTO web_rate_counts (key, ts) VALUES (?, ?)', args: [String(key), now] });
    return { ok: true, remaining: maxHits - used - 1 };
  } catch {
    return { ok: true, remaining: maxHits };
  }
}
