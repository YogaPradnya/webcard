import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import {
  loadMigrations, splitStatements, applyMigrations, assertSchemaReady,
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
});
