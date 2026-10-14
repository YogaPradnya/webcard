import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { applyMigrations, assertSchemaReady } from '../src/lib/schema.js';

// npm run migrate — terapkan db/migrations/*.sql ke Turso (idempoten).
// Dibaca dari .env.local (atau env proses bila sudah di-set, mis. di VPS).

function loadEnvFile() {
  const out = {};
  for (const f of ['.env.local', '.env']) {
    const p = path.join(process.cwd(), f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  }
  return out;
}

const fileEnv = loadEnvFile();
const url = process.env.TURSO_URL || fileEnv.TURSO_URL || '';
const authToken = process.env.TURSO_AUTH_TOKEN || fileEnv.TURSO_AUTH_TOKEN || '';
if (!url) {
  console.error('[MIGRATE] TURSO_URL kosong. Isi .env.local dulu.');
  process.exit(1);
}

const db = createClient({ url, authToken });
const applied = await applyMigrations(db);
if (applied.length === 0) console.log('[MIGRATE] tidak ada migrasi baru.');
await assertSchemaReady(db);
console.log('[MIGRATE] OK.');
process.exit(0);
