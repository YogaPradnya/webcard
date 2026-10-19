import { createClient } from '@libsql/client';

let _rawClient = null;

// Per-request timeout untuk fetch ke sqld: 7 detik.
// Lebih pendek dari API timeout (9s) agar sempat retry sebelum API timeout.
const DB_FETCH_TIMEOUT_MS = 7000;
// Retry 1x untuk transient failure (fetch failed, timeout, network error).
const DB_MAX_RETRIES = 1;
const DB_RETRY_DELAY_MS = 500;

// Custom fetch dengan per-request timeout via AbortController.
// Libsql client HTTP transport pakai global fetch tanpa timeout,
// sehingga bisa hang selamanya bila sqld tidak merespons.
function fetchWithTimeout(url, init) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), DB_FETCH_TIMEOUT_MS);
  // Gabungkan signal: libsql mungkin kirim signal sendiri.
  const origSignal = init?.signal;
  if (origSignal) {
    origSignal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  return fetch(url, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(t));
}

function createRawClient() {
  if (_rawClient) return _rawClient;
  const url = process.env.TURSO_URL || '';
  const authToken = process.env.TURSO_AUTH_TOKEN || '';
  if (!url) throw new Error('TURSO_URL belum diisi di .env.local');
  _rawClient = createClient({ url, authToken, fetch: fetchWithTimeout });
  return _rawClient;
}

function isTransientError(e) {
  const msg = String(e?.message || e).toLowerCase();
  return (
    msg.includes('fetch failed') ||
    msg.includes('aborted') ||
    msg.includes('abort') ||
    msg.includes('network') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('timeout')
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Wrapper yang retry execute() untuk transient failures.
// Non-transient errors (SQL error, auth error) langsung dilempar.
const _dbProxy = {
  execute: async (...args) => {
    const raw = createRawClient();
    for (let attempt = 0; attempt <= DB_MAX_RETRIES; attempt++) {
      try {
        return await raw.execute(...args);
      } catch (e) {
        if (attempt < DB_MAX_RETRIES && isTransientError(e)) {
          console.warn(`[DB] transient error, retry ${attempt + 1}/${DB_MAX_RETRIES}: ${String(e?.message || e).slice(0, 80)}`);
          await sleep(DB_RETRY_DELAY_MS);
          continue;
        }
        throw e;
      }
    }
  },
  // transaction() tidak di-retry (stateful, harus all-or-nothing dari caller).
  transaction: (...args) => createRawClient().transaction(...args),
  // batch() juga pass-through (jarang dipakai, dan stateful).
  batch: (...args) => createRawClient().batch(...args),
};

// Klien Turso (HTTP, aman untuk serverless). DB SAMA dengan bot agar koleksi nyambung.
// Mengembalikan proxy dengan retry bawaan untuk transient failures.
export function getDb() {
  return _dbProxy;
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
      const tx = await createRawClient().transaction('write');
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
