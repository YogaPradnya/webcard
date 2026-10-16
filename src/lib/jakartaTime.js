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
