// Akun khusus (pemilik semua kartu / akun tes-admin): dibebaskan dari hitungan
// stok global & pity gacha (lihat lib/gacha.js), DAN disembunyikan dari
// klasemen Kolektor (jumlah kartu) — akun ini pasti punya semua kartu.
// PvP, XP, dan tampilan lain tetap menampilkan mereka seperti user biasa.
// Env STOCK_EXCLUDE_USERNAMES="yogaa,minnzcloud" (pisah koma). Default: yogaa.
export function parseExcludedUsernames(raw) {
  const src = raw !== undefined ? raw : (process.env.STOCK_EXCLUDE_USERNAMES ?? 'yogaa');
  return String(src).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// Potongan SQL untuk membuang akun ter-exclude dari hasil query.
// join = 'WHERE' bila query belum punya WHERE, 'AND' bila sudah ada.
// Return { sql: '', args: [] } bila daftar kosong (tanpa filter).
export function excludedUsernamesClause(excl, column = 'username', join = 'WHERE') {
  const list = Array.isArray(excl) ? excl : parseExcludedUsernames(excl);
  if (list.length === 0) return { sql: '', args: [] };
  return {
    sql: ` ${join} LOWER(${column}) NOT IN (${list.map(() => '?').join(',')})`,
    args: [...list],
  };
}
