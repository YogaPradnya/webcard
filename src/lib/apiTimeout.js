// Tanpa import next/server (pakai Response global) agar bisa di-unit-test
// plain node. Route handler boleh mengembalikan Response biasa.

// Penjaga hang di sisi server: balapan handler vs timeout. Bila handler
// (biasanya DB Turso yang menggantung) melewati batas, klien langsung dapat
// 503 + bisa retry, bukan menggantung koneksi selamanya. Pekerjaan yang
// sudah terlanjur jalan di background tetap selesai sendiri (best-effort).
// JANGAN dipakai untuk SSE/stream (koneksi memang panjang).
//
// ATURAN: timeout server HARUS lebih pendek dari timeout klien, supaya 503
// rapi ("Server sibuk, coba lagi.") sempat terkirim sebelum klien menyerah.
// Klien: fetchJson default 12 dtk, battle GET 10 dtk / POST 20 dtk,
// upload gambar 30 dtk (lihat web-cards/src/app + lib/fetchJson.js).
export const READ_TIMEOUT_MS = 9000; // < 10 dtk (GET battle) & 12 dtk (default klien)
export const WRITE_TIMEOUT_MS = 18000; // Tokopay API call bisa 3-5 dtk, total flow perlu ruang lebih
export const UPLOAD_TIMEOUT_MS = 25000; // khusus upload Cloudinary (< 30 dtk klien)

// Request lebih lambat dari ini dicatat server-side (bukti untuk investigasi
// latency; insiden 17 Okt: p95 8 dtk tidak kelihatan sampai log platform dibaca).
const SLOW_LOG_MS = 2000;

function safePath(req) {
  try {
    return new URL(req?.url || '', 'http://local').pathname;
  } catch {
    return '';
  }
}

export function withTimeout(handler, ms = READ_TIMEOUT_MS, label = 'API') {
  return async (req, ctx) => {
    const t0 = Date.now();
    let timer = null;
    try {
      const res = await Promise.race([
        handler(req, ctx),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const err = new Error('API_TIMEOUT');
            err.code = 'API_TIMEOUT';
            reject(err);
          }, ms);
        }),
      ]);
      const elapsed = Date.now() - t0;
      if (elapsed >= SLOW_LOG_MS) {
        console.warn(`[SLOW ${label}] ${elapsed}ms ${safePath(req)}${res?.status ? ` -> ${res.status}` : ''}`);
      }
      return res;
    } catch (e) {
      if (e?.code === 'API_TIMEOUT') {
        console.error(`[${label}] timeout ${ms}ms -> 503`);
        return Response.json({ success: false, message: 'Server sibuk, coba lagi.' }, { status: 503 });
      }
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
