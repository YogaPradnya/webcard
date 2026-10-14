import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './db.js';

// Satu-satunya sumber skema web: db/migrations/*.sql (versioned, forward-only).
// Request path DILARANG DDL: semua ensure* harus `if (isSchemaReady()) return;`
// di baris pertama. DDL di ensure* hanya fallback darurat bila migrasi
// belum pernah jalan (dev / DB baru). Lihat db/SCHEMA_OWNERSHIP.md.

let _migrations = null;
let _schemaReady = false;
let _bootPromise = null;

function migrationsDir() {
  // cwd = root web-cards saat `next start`, `npm run migrate`, dan `npm test`.
  const fromCwd = path.join(process.cwd(), 'db', 'migrations');
  if (fs.existsSync(fromCwd)) return fromCwd;
  // Fallback: relatif terhadap file ini (src/lib/ -> ../../db/migrations).
  const here = path.dirname(new URL(import.meta.url).pathname);
  return path.join(here, '..', '..', 'db', 'migrations');
}

export function loadMigrations() {
  if (_migrations) return _migrations;
  const dir = migrationsDir();
  const files = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  _migrations = files.map((f) => {
    const version = parseInt(f.split('_')[0], 10);
    return { version, name: f, sql: fs.readFileSync(path.join(dir, f), 'utf8') };
  });
  return _migrations;
}

export function getExpectedVersion() {
  const all = loadMigrations();
  return all.length > 0 ? Math.max(...all.map((m) => m.version)) : 0;
}

// Pecah file SQL jadi statement (satu statement per blok `;` + baris baru).
export function splitStatements(sql) {
  return String(sql || '')
    .split(/;[ \t]*\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.endsWith(';') ? s : `${s};`));
}

export async function getAppliedVersion(db) {
  await db.execute('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)');
  const res = await db.execute({ sql: 'SELECT MAX(version) AS v FROM schema_version', args: [] });
  return Number(res.rows[0]?.v || 0);
}

// Terapkan migrasi yang belum jalan. Idempoten, aman diulang.
// Error "duplicate column" pada ALTER diabaikan (DB lama maju bertahap).
export async function applyMigrations(db) {
  const applied = [];
  const current = await getAppliedVersion(db);
  for (const m of loadMigrations()) {
    if (m.version <= current) continue;
    // Cek ulang per file agar paralel/rerun tidak dobel-apply.
    const now = await getAppliedVersion(db);
    if (m.version <= now) continue;
    for (const stmt of splitStatements(m.sql)) {
      try {
        await db.execute(stmt);
      } catch (e) {
        const msg = String(e?.message || e);
        const isAlter = /^ALTER\s/i.test(stmt.trim());
        // DB lama maju bertahap (kolom sudah ada) atau tabel milik bot
        // belum dibuat bot -> keduanya aman dilewati.
        if (isAlter && (/duplicate column/i.test(msg) || /no such table/i.test(msg))) continue;
        throw new Error(`[MIGRATE ${m.name}] ${msg}`);
      }
    }
    await db.execute({
      sql: 'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (?, ?)',
      args: [m.version, Date.now()],
    });
    applied.push(m.version);
    console.log(`[MIGRATE] applied ${m.name}`);
  }
  return applied;
}

export function isSchemaReady() {
  return _schemaReady;
}

export function markSchemaReady() {
  _schemaReady = true;
}

// Dipakai saat boot (instrumentation): kejar migrasi bila tertinggal,
// tandai ready bila versi DB >= versi file. Gagal -> log loud, situs tetap
// hidup via fallback ensure* (fail-safe, lihat SCHEMA_OWNERSHIP).
export async function initSchemaOnBoot() {
  if (_schemaReady) return true;
  if (_bootPromise) { await _bootPromise; return _schemaReady; }
  _bootPromise = (async () => {
    try {
      const db = getDb();
      const before = await getAppliedVersion(db);
      const expected = getExpectedVersion();
      if (before < expected) {
        console.log(`[SCHEMA] migrasi tertinggal (db=${before}, kode=${expected}), mengejar...`);
        await applyMigrations(db);
      }
      markSchemaReady();
      console.log(`[SCHEMA] ready (v${expected})`);
    } catch (e) {
      console.error('[SCHEMA BOOT GAGAL]', String(e?.message || e));
    } finally {
      _bootPromise = null;
    }
  })();
  await _bootPromise;
  return _schemaReady;
}

// Validasi eksplisit untuk skrip/tooling. Return { ok, db, expected }.
export async function assertSchemaReady(db) {
  const conn = db || getDb();
  const cur = await getAppliedVersion(conn);
  const expected = getExpectedVersion();
  if (cur < expected) {
    const err = new Error(`SCHEMA_OUTDATED: db=v${cur}, kode=v${expected}. Jalankan: npm run migrate`);
    err.code = 'SCHEMA_OUTDATED';
    throw err;
  }
  return { ok: true, db: cur, expected };
}
