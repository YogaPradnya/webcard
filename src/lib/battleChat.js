import { getDb } from './db.js';

export const BATTLE_CHAT_MAX_LEN = 200;
export const BATTLE_CHAT_PAGE_SIZE = 50;
export const BATTLE_CHAT_RATE_MS = 1500;

export async function ensureBattleChatTable() {
  await getDb().execute(`
    CREATE TABLE IF NOT EXISTS battle_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  await getDb().execute(
    'CREATE INDEX IF NOT EXISTS idx_battle_msg_code ON battle_messages (code, id)',
  );
}

export function sanitizeBattleMessage(value) {
  return String(value || '').trim().slice(0, BATTLE_CHAT_MAX_LEN);
}

export async function cleanupBattleChat(code) {
  try {
    await getDb().execute({ sql: 'DELETE FROM battle_messages WHERE code = ?', args: [String(code)] });
  } catch { /* abaikan */ }
}
