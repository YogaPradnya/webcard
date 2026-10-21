export function jakartaDateKey(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Kunci minggu: tanggal Senin (WIB) minggu berjalan. Tanpa DST (WIB = UTC+7 tetap).
export function jakartaWeekKey(d = new Date()) {
  const offsetMin = 7 * 60 + d.getTimezoneOffset();
  const wib = new Date(d.getTime() + offsetMin * 60000);
  const day = wib.getDay();
  const diff = (day + 6) % 7;
  wib.setDate(wib.getDate() - diff);
  const y = wib.getFullYear();
  const m = String(wib.getMonth() + 1).padStart(2, '0');
  const dd = String(wib.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Kunci bulan WIB: 'YYYY-MM'.
export function jakartaMonthKey(d = new Date()) {
  return jakartaDateKey(d).slice(0, 7);
}

// Tanggal WIB (1-31). Dipakai untuk masa tenggang klaim awal bulan.
export function jakartaDayOfMonth(d = new Date()) {
  return Number(jakartaDateKey(d).slice(8, 10)) || 1;
}

// Rentang [startMs, endMs) satu bulan WIB. Tanpa DST (WIB = UTC+7 tetap).
// monthKey opsional ('YYYY-MM'); default bulan berjalan.
export function jakartaMonthRange(monthKey) {
  const key = String(monthKey || jakartaMonthKey());
  const [y, m] = key.split('-').map(Number);
  const WIB_MS = 7 * 60 * 60 * 1000;
  return {
    key,
    startMs: Date.UTC(y, m - 1, 1) - WIB_MS,
    endMs: Date.UTC(y, m, 1) - WIB_MS,
  };
}

// Kunci bulan sebelumnya dari 'YYYY-MM' (aman lintas tahun).
export function prevMonthKey(monthKey) {
  const [y, m] = String(monthKey || jakartaMonthKey()).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Kunci bulan berikutnya dari 'YYYY-MM' (aman lintas tahun).
export function nextMonthKey(monthKey) {
  const [y, m] = String(monthKey || jakartaMonthKey()).split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

// Label bulan Indonesia dari kunci 'YYYY-MM' -> 'Oktober 2026'.
export function jakartaMonthLabel(monthKey) {
  const [y, m] = String(monthKey || jakartaMonthKey()).split('-').map(Number);
  return `${MONTHS_ID[(m || 1) - 1] || m} ${y}`;
}

// Label tanggal Indonesia dari timestamp ms (WIB) -> '3 November 2026'.
export function jakartaDateLabel(ts) {
  const d = new Date(Number(ts) || Date.now());
  return `${d.toLocaleDateString('id-ID', { day: 'numeric', timeZone: 'Asia/Jakarta' })} ${jakartaMonthLabel(jakartaMonthKey(d))}`;
}
