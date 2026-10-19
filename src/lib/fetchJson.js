// Helper fetch klien seragam: timeout via AbortController agar tidak ada
// lagi skeleton abadi bila 1 API menggantung (pelajaran insiden /battle,
// /book). Return { ok, status, data }. Timeout default 12 detik.
// Dipakai semua halaman + Sidebar (jangan fetch mentah lagi).

// Retry otomatis 1x untuk 503 (server sibuk / Turso menggantung).
// Delay 1 detik sebelum retry agar server sempat pulih.
const RETRY_DELAY_MS = 1000;
const MAX_RETRIES = 1;

async function fetchOnce(path, { ms = 12000, ...init } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(path, { ...init, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchJson(path, opts = {}) {
  const result = await fetchOnce(path, opts);
  // Retry otomatis untuk 503 (server sibuk): 1x dengan delay.
  if (result.status === 503) {
    for (let i = 0; i < MAX_RETRIES; i++) {
      await sleep(RETRY_DELAY_MS);
      const retry = await fetchOnce(path, opts);
      if (retry.status !== 503) return retry;
    }
  }
  return result;
}

// GET JSON dengan toleransi gagal: return {} bila timeout/abort.
// Untuk data pelengkap (leaderboard mini, slot, dsb) agar halaman utama
// tetap tampil walau 1 API mati.
// Timeout dinaikkan dari 10s ke 16s untuk mengakomodasi retry 503.
export async function fetchLenient(path, ms = 16000) {
  try {
    const { ok, data } = await fetchJson(path, { ms });
    return ok ? data : {};
  } catch {
    return {};
  }
}
