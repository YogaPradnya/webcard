import { randomBytes, createHash } from 'node:crypto';
import { getDb } from './db.js';
import { isSchemaReady } from './schema.js';

// Fallback lama: kode login lahir di WEB; endpoint dipertahankan untuk kompatibilitas.
// UI utama sekarang memakai username/email + password Animein; route kode
// dipertahankan untuk rollback.

export const LOGIN_CODE_TTL_MS = 5 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateLoginCode() {
  const bytes = randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

export function normalizeLoginCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export function hashToken(token) {
  return createHash('sha256').update(String(token || '')).digest('hex');
}

export function newToken() {
  return randomBytes(32).toString('hex');
}

export async function ensureLoginCodeTable() {
  if (isSchemaReady()) return; // DDL sudah diurus migrasi (0 round-trip).
  await getDb().execute(`
    CREATE TABLE IF NOT EXISTS web_login_codes (
      code TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL,
      user_id TEXT DEFAULT NULL,
      username TEXT NOT NULL DEFAULT '',
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  // Catatan persetujuan TnC (best-effort untuk DB lama).
  try { await getDb().execute('ALTER TABLE web_login_codes ADD COLUMN tnc_at INTEGER DEFAULT 0'); } catch { /* sudah ada */ }
}
