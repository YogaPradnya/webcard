// Tanpa import next/server (pakai Response global) agar bisa di-unit-test
// plain node. Route handler boleh mengembalikan Response biasa.

// Penjaga hang di sisi server: balapan handler vs timeout. Bila handler
// (biasanya DB Turso yang menggantung) melewati batas, klien langsung dapat
// 503 + bisa retry, bukan menggantung koneksi selamanya. Pekerjaan yang
// sudah terlanjur jalan di background tetap selesai sendiri (best-effort).
// JANGAN dipakai untuk SSE/stream (koneksi memang panjang).
// Untuk POST mutasi (pull/claim/order) pakai batas longgar (45 dtk) agar
// tidak memotong transaksi yang sah; klien TIDAK auto-retry POST.
export function withTimeout(handler, ms = 15000, label = 'API') {
  return async (req, ctx) => {
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

export const READ_TIMEOUT_MS = 15000;
export const WRITE_TIMEOUT_MS = 45000;
