import { getDb } from './db.js';
import { isSchemaReady } from './schema.js';

// Preferensi pajangan .profil: 'auto' (display dulu lalu gacha), 'gacha', atau 'display'.
// Mirror bot src/database/profilePrefRepo.js.
export const SHOWCASE_SOURCES = ['auto', 'gacha', 'display'];

export function normalizeSource(v) {
  const s = String(v || 'auto').trim().toLowerCase();
  return SHOWCASE_SOURCES.includes(s) ? s : 'auto';
}

export async function ensureProfilePrefsTable() {
  if (isSchemaReady()) return; // DDL sudah diurus migrasi (0 round-trip).
  await getDb().execute(`
    CREATE TABLE IF NOT EXISTS user_profile_prefs (
      user_id TEXT PRIMARY KEY,
      showcase_source TEXT NOT NULL DEFAULT 'auto',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function getShowcaseSource(userId) {
  try {
    await ensureProfilePrefsTable();
    const res = await getDb().execute({
      sql: 'SELECT showcase_source FROM user_profile_prefs WHERE user_id = ?',
      args: [String(userId)],
    });
    if (res.rows.length === 0) return 'auto';
    return normalizeSource(res.rows[0].showcase_source);
  } catch {
    return 'auto';
  }
}

export async function setShowcaseSource(userId, source) {
  const clean = String(source || '').trim().toLowerCase();
  if (!SHOWCASE_SOURCES.includes(clean)) {
    return { ok: false, error: 'Sumber harus auto, gacha, atau display.' };
  }
  await ensureProfilePrefsTable();
  await getDb().execute({
    sql: `INSERT INTO user_profile_prefs (user_id, showcase_source, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET showcase_source = excluded.showcase_source,
          updated_at = CURRENT_TIMESTAMP`,
    args: [String(userId), clean],
  });
  return { ok: true, source: clean };
}
