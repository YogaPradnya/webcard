import { getDb } from './db.js';

export const DISPLAY_BORDERS = ['gold', 'rainbow', 'neon', 'sakura', 'shadow', 'classic', 'custom'];

export const DISPLAY_BORDER_COLORS = {
  gold: '#eab308',
  rainbow: 'linear-gradient(135deg,#ef4444,#eab308,#22c55e,#3b82f6,#a855f7)',
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
