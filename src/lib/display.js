import { getDb } from './db.js';

export const DISPLAY_BORDERS = ['gold', 'rainbow', 'neon', 'sakura', 'shadow', 'classic', 'custom'];

export const DISPLAY_BORDER_COLORS = {
  gold: '#eab308',
  rainbow: '#a855f7',
  neon: '#22d3ee',
  sakura: '#f9a8d4',
  shadow: '#111827',
  classic: '#9ca3af',
};

export async function ensureDisplayTable() {
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_display_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL,
      grade TEXT NOT NULL DEFAULT '',
      border_type TEXT NOT NULL DEFAULT 'classic',
      border_color TEXT NOT NULL DEFAULT '',
      image_url TEXT DEFAULT NULL,
      description TEXT NOT NULL DEFAULT '',
      is_showcase INTEGER DEFAULT 0,
      gifted_by TEXT NOT NULL DEFAULT 'admin',
      gifted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_display_name_unique ON user_display_cards (name)').catch(() => {});
  await db.execute('CREATE INDEX IF NOT EXISTS idx_display_user ON user_display_cards (user_id)').catch(() => {});
  // Jatah ubah custom (maks 3x, sama seperti slot custom). Best-effort untuk DB lama.
  try { await db.execute('ALTER TABLE user_display_cards ADD COLUMN edits_used INTEGER DEFAULT 0'); } catch { /* sudah ada */ }
  try { await db.execute('UPDATE user_display_cards SET edits_used = 0 WHERE edits_used IS NULL'); } catch { /* abaikan */ }
}

// Aturan jatah ubah kartu pajangan (admin maupun custom): maks 3x per kartu.
export const MAX_DISPLAY_EDITS = 3;

export function displayEditsLeft(editsUsed) {
  return Math.max(0, MAX_DISPLAY_EDITS - (Number(editsUsed) || 0));
}

function mapRow(r) {
  return {
    id: Number(r.id),
    name: String(r.name),
    grade: String(r.grade || ''),
    borderType: String(r.border_type || 'classic'),
    borderColor: String(r.border_color || ''),
    imageUrl: r.image_url || null,
    description: String(r.description || ''),
    showcase: Number(r.is_showcase) === 1,
    giftedAt: r.gifted_at || null,
    editsUsed: Number(r.edits_used) || 0,
    editsLeft: displayEditsLeft(r.edits_used),
  };
}

// Koleksi display milik user (display-only, tidak masuk book gacha).
export async function getDisplayCards(userId) {
  await ensureDisplayTable();
  const res = await getDb().execute({
    sql: 'SELECT * FROM user_display_cards WHERE user_id = ? ORDER BY gifted_at DESC, id DESC',
    args: [String(userId)],
  });
  const cards = (res.rows || []).map(mapRow);
  return { cards, total: cards.length };
}

// Jumlah kartu pajangan admin milik user (dihitung dalam kuota 50 gabungan).
export async function countDisplayCards(userId) {
  await ensureDisplayTable();
  const res = await getDb().execute({
    sql: 'SELECT COUNT(*) AS c FROM user_display_cards WHERE user_id = ?',
    args: [String(userId)],
  });
  return Number(res.rows[0]?.c || 0);
}

function cleanHex(v) {
  const s = String(v || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return '';
}

// Custom kartu admin milik sendiri: gambar, border, deskripsi (nama dikunci).
// Tiap Simpan memakai 1 jatah (maks 3x, sama seperti slot custom).
// Return { ok, editsLeft } / { ok:false, error }.
export async function customizeDisplayCard(userId, cardId, input = {}) {
  await ensureDisplayTable();
  const res = await getDb().execute({
    sql: 'SELECT id, edits_used FROM user_display_cards WHERE id = ? AND user_id = ?',
    args: [Number(cardId), String(userId)],
  });
  if (res.rows.length === 0) return { ok: false, error: 'Kartu tidak ditemukan.' };
  const used = Number(res.rows[0].edits_used) || 0;
  if (used >= MAX_DISPLAY_EDITS) {
    return { ok: false, error: 'Jatah ubah habis (3x).' };
  }
  const imageUrl = String(input.imageUrl || '').trim();
  if (imageUrl && (imageUrl.length > 2000 || !/^https?:\/\/.+/i.test(imageUrl))) {
    return { ok: false, error: 'URL gambar harus http(s), maks 2000 karakter.' };
  }
  const borderType = DISPLAY_BORDERS.includes(String(input.borderType)) ? String(input.borderType) : 'classic';
  const borderColor = borderType === 'custom' ? cleanHex(input.borderColor) : '';
  if (borderType === 'custom' && !borderColor) return { ok: false, error: 'Warna custom harus hex (contoh #a855f7).' };
  const description = String(input.description || '').trim().slice(0, 280);
  await getDb().execute({
    sql: `UPDATE user_display_cards
          SET image_url = ?, border_type = ?, border_color = ?, description = ?,
              edits_used = edits_used + 1
          WHERE id = ? AND user_id = ?`,
    args: [imageUrl || null, borderType, borderColor, description, Number(cardId), String(userId)],
  });
  return { ok: true, editsLeft: MAX_DISPLAY_EDITS - used - 1 };
}

// Guard: nama ini kartu display milik user? (tolak battle/trade/gacha/convert).
export async function isDisplayOwned(userId, name) {
  try {
    await ensureDisplayTable();
    const res = await getDb().execute({
      sql: 'SELECT id FROM user_display_cards WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1',
      args: [String(userId), String(name || '').trim()],
    });
    return res.rows.length > 0;
  } catch {
    return false;
  }
}
