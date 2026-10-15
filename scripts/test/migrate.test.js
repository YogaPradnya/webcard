import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import {
  loadMigrations, splitStatements, stripSqlComments, applyMigrations, assertSchemaReady,
  getExpectedVersion, getAppliedVersion, isSchemaReady, markSchemaReady,
} from '../../src/lib/schema.js';

const EXPECTED_TABLES = [
  'battle_rooms', 'battle_leaderboard', 'battle_history', 'battle_daily',
  'trade_offers',
  'user_card_pity', 'web_gacha_history',
  'shop_orders', 'user_display_slots',
  'user_display_cards',
  'mission_progress', 'mission_claims',
  'web_login_codes', 'user_profile_prefs', 'web_rate_limits', 'web_rate_counts',
];

describe('migrasi skema', () => {
  it('8 file versioned berurutan tanpa lompat', () => {
    const all = loadMigrations();
    assert.equal(all.length, 8);
    assert.deepEqual(all.map((m) => m.version), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(getExpectedVersion(), 8);
  });
  it('apply di DB kosong membuat semua tabel + idempoten', async () => {
    const db = createClient({ url: ':memory:' });
    // Simulasi DB lama: tabel bot sudah ada tanpa kolom web.
    await db.execute('CREATE TABLE user_cards (user_id TEXT, char_name TEXT)');
    await db.execute('CREATE TABLE user_stats (user_id TEXT PRIMARY KEY, username TEXT)');
    const first = await applyMigrations(db);
    assert.equal(first.length, 8);
    const tables = await db.execute({ sql: "SELECT name FROM sqlite_master WHERE type = 'table'", args: [] });
    const names = new Set(tables.rows.map((r) => String(r.name)));
    for (const t of [...EXPECTED_TABLES, 'schema_version']) assert.ok(names.has(t), `hilang: ${t}`);
    // Kolom web ter-backfill di tabel bot.
    const cols = await db.execute({ sql: 'PRAGMA table_info(user_cards)', args: [] });
    assert.ok(cols.rows.some((r) => String(r.name) === 'quantity'));
    // Rerun: tidak ada yang di-apply lagi.
    const second = await applyMigrations(db);
    assert.equal(second.length, 0);
    assert.equal(await getAppliedVersion(db), 8);
    const ok = await assertSchemaReady(db);
    assert.equal(ok.ok, true);
  });
  it('assertSchemaReady menolak DB tertinggal', async () => {
    const db = createClient({ url: ':memory:' });
    await assert.rejects(() => assertSchemaReady(db), /SCHEMA_OUTDATED/);
  });
  it('flag ready bisa ditandai', () => {
    assert.equal(isSchemaReady(), false);
    markSchemaReady();
    assert.equal(isSchemaReady(), true);
  });
  it('splitStatements tidak memecah string kosong', () => {
    const parts = splitStatements("ALTER TABLE a ADD COLUMN b TEXT DEFAULT '';\nUPDATE a SET b = 1;");
    assert.equal(parts.length, 2);
  });
  it('komentar di depan ALTER dikupas (regresi SCHEMA BOOT GAGAL)', () => {
    const cleaned = stripSqlComments('-- 008: komentar\nALTER TABLE a ADD COLUMN b INTEGER;');
    assert.match(cleaned.trim(), /^ALTER\s/i);
    const parts = splitStatements('-- 008: komentar\nALTER TABLE a ADD COLUMN b INTEGER;\nUPDATE a SET b = 1 WHERE b IS NULL;');
    assert.equal(parts.length, 2);
    assert.match(parts[0], /^ALTER\s/i);
    // String berisi -- dan ; tidak rusak
    const tricky = splitStatements("INSERT INTO t (a) VALUES ('a--b;c');");
    assert.equal(tricky.length, 1);
    assert.match(tricky[0], /a--b;c/);
  });
  it('008 tuntas di DB lama yang kolomnya sudah ada (seperti produksi)', async () => {
    const db = createClient({ url: ':memory:' });
    // Simulasi produksi: tabel bot SUDAH punya kolom web + versi macet di 7.
    await db.execute('CREATE TABLE user_cards (user_id TEXT, char_name TEXT, quantity INTEGER DEFAULT 1)');
    await db.execute('CREATE TABLE user_stats (user_id TEXT PRIMARY KEY, username TEXT, web_title TEXT DEFAULT NULL)');
    for (const m of loadMigrations()) {
      if (m.version >= 8) continue;
      for (const stmt of splitStatements(m.sql)) {
        try { await db.execute(stmt); } catch (e) {
          if (/duplicate column|no such table|already exists/i.test(String(e?.message || e))) continue;
          throw e;
        }
      }
    }
    await getAppliedVersion(db); // buat tabel schema_version dulu
    await db.execute({ sql: 'INSERT OR REPLACE INTO schema_version (version, applied_at) VALUES (7, ?)', args: [Date.now()] });
    // Inilah yang meledak di produksi: sekarang harus tuntas tanpa throw.
    const applied = await applyMigrations(db);
    assert.deepEqual(applied, [8]);
    assert.equal(await getAppliedVersion(db), 8);
    await assertSchemaReady(db);
  });
});
