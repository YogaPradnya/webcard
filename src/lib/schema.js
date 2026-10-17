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

// PENTING (insiden 17 Okt): webpack/Next memberi bundle TERPISAH untuk
// instrumentation.js dan tiap route — `_schemaReady` yang diset instrumentation
// TIDAK terlihat oleh salinan modul di route, sehingga semua ensure* mengira
// skema belum siap dan menjalankan DDL fallback (CREATE/ALTER berurutan ~1 dtk
// per statement ke Turso Tokyo) di SETIAP request. Itu biang p95 8-10 dtk.
// Solusi: simpan status ready di globalThis (per proses, lintas bundle).
const GLOBAL_READY_KEY = '__animeinSchemaReadyV1';

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

// Kupas komentar SQL (-- baris & /* blok*) dengan hormat pada string
// kutip ('...', "...", `...`, termasuk escape '' ). Wajib sebelum deteksi
// jenis statement: statement 008 diawali baris komentar sehingga cek
// /^ALTER/ gagal dan error "duplicate column" yang harusnya ditoleransi
// malah dilempar (insiden SCHEMA BOOT GAGAL di produksi).
export function stripSqlComments(sql) {
  const s = String(sql || '');
  let out = '';
  let i = 0;
  let quote = null;
  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];
    if (quote) {
      out += c;
      if (c === quote) {
        if (next === quote) { out += next; i += 2; continue; }
        quote = null;
      }
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; out += c; i += 1; continue; }
    if (c === '-' && next === '-') {
      while (i < s.length && s[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

// Pecah SQL jadi statement pada `;` DI LUAR string kutip. Komentar dikupas
// dulu agar statement bersih dieksekusi & terdeteksi jenisnya.
export function splitStatements(sql) {
  const clean = stripSqlComments(sql);
  const parts = [];
  let cur = '';
  let quote = null;
  let i = 0;
  while (i < clean.length) {
    const c = clean[i];
    if (quote) {
      cur += c;
      if (c === quote) {
        if (clean[i + 1] === quote) { cur += clean[i + 1]; i += 2; continue; }
        quote = null;
      }
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; cur += c; i += 1; continue; }
    if (c === ';') {
      if (cur.trim()) parts.push(`${cur.trim()};`);
      cur = '';
      i += 1;
      continue;
    }
    cur += c;
    i += 1;
  }
  if (cur.trim()) parts.push(`${cur.trim()};`);
  return parts;
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
  if (_schemaReady) return true;
  try {
    if (globalThis[GLOBAL_READY_KEY] === true) {
      _schemaReady = true; // cache lokal agar cek berikutnya gratis
      return true;
    }
  } catch { /* lingkungan aneh -> anggap belum siap */ }
  return false;
}

export function markSchemaReady() {
  _schemaReady = true;
  try { globalThis[GLOBAL_READY_KEY] = true; } catch { /* abaikan */ }
}

// Dipakai saat boot (instrumentation): kejar migrasi bila tertinggal,
// tandai ready bila versi DB >= versi file. Gagal -> log loud, situs tetap
// hidup via fallback ensure* (fail-safe, lihat SCHEMA_OWNERSHIP).
export async function initSchemaOnBoot() {
  if (isSchemaReady()) return true;
  if (_bootPromise) { await _bootPromise; return isSchemaReady(); }
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
  return isSchemaReady();
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
