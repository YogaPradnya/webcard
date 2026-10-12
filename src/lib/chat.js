import { getDb } from './db';

export const CHAT_MAX_LEN = 500;
export const CHAT_PAGE_SIZE = 30;
export const CHAT_RATE_MS = 3000;

export async function ensureChatTable() {
  await getDb().execute(`
    CREATE TABLE IF NOT EXISTS web_group_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  await getDb().execute(
    'CREATE INDEX IF NOT EXISTS idx_chat_created ON web_group_messages (created_at DESC, id DESC)',
  );
  // Kolom reply (tahan lama untuk balas). Best-effort agar DB lama ikut migrasi.
  try { await getDb().execute('ALTER TABLE web_group_messages ADD COLUMN reply_to_id INTEGER DEFAULT NULL'); } catch { /* sudah ada */ }
  try { await getDb().execute('ALTER TABLE web_group_messages ADD COLUMN reply_username TEXT DEFAULT NULL'); } catch { /* sudah ada */ }
  try { await getDb().execute('ALTER TABLE web_group_messages ADD COLUMN reply_message TEXT DEFAULT NULL'); } catch { /* sudah ada */ }
}

export function sanitizeMessage(value) {
  return String(value || '').trim().slice(0, CHAT_MAX_LEN);
}
