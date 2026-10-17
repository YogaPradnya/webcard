// Dijalankan sekali saat server Next.js boot (butuh
// experimental.instrumentationHook di next.config.js).
// Mengejar migrasi DB yang tertinggal, lalu menandai skema ready agar
// semua ensure* di request path lewati DDL (0 round-trip).
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { initSchemaOnBoot } = await import('./lib/schema.js');
      await initSchemaOnBoot();
      // Panaskan write-transaction pertama (stall 12-35 dtk per proses,
      // lihat lib/db.js) — jangan blokir boot.
      const { warmWriteTxOnce } = await import('./lib/db.js');
      warmWriteTxOnce();
    } catch (e) {
      console.error('[SCHEMA BOOT]', String(e?.message || e));
    }
  }
}
