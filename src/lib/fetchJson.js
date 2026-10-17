// Helper fetch klien seragam: timeout via AbortController agar tidak ada
// lagi skeleton abadi bila 1 API menggantung (pelajaran insiden /battle,
// /book). Return { ok, status, data }. Timeout default 12 detik.
// Dipakai semua halaman + Sidebar (jangan fetch mentah lagi).

export async function fetchJson(path, { ms = 12000, ...init } = {}) {
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

// GET JSON dengan toleransi gagal: return {} bila timeout/abort.
// Untuk data pelengkap (leaderboard mini, slot, dsb) agar halaman utama
// tetap tampil walau 1 API mati.
export async function fetchLenient(path, ms = 10000) {
  try {
    const { ok, data } = await fetchJson(path, { ms });
    return ok ? data : {};
  } catch {
    return {};
  }
}
