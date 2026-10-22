import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// DB in-memory: uji jalur performWebPulls end-to-end (debit, stok, refund).
process.env.TURSO_URL = 'file::memory:';
process.env.TURSO_AUTH_TOKEN = '';

const { getDb } = await import('../../src/lib/db.js');
const { performWebPulls } = await import('../../src/lib/gacha.js');

const db = getDb();

before(async () => {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_stats (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL DEFAULT '',
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      custom_title TEXT DEFAULT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS user_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      char_name TEXT NOT NULL,
      anime TEXT NOT NULL DEFAULT '',
      rarity TEXT NOT NULL DEFAULT 'Common',
      level INTEGER DEFAULT 1,
      power INTEGER DEFAULT 0,
      image_url TEXT DEFAULT NULL,
      is_showcase INTEGER DEFAULT 0,
      quantity INTEGER DEFAULT 1,
      pulled_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_user_char ON user_cards (user_id, char_name)');

  const pool = [{ name: 'Epic Only', anime: 'Test', tier: 'Epic' }];
  const rates = { Common: 0, Rare: 0, Epic: 100, Legendary: 0, Mythic: 0 };
  const stocks = { Epic: 1, Legendary: 10 };
  for (const [key, value] of [
    ['gacha_pool', JSON.stringify(pool)],
    ['gacha_rates', JSON.stringify(rates)],
    ['gacha_stocks', JSON.stringify(stocks)],
  ]) {
    await db.execute({
      sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      args: [key, value],
    });
  }
  for (const id of ['u1', 'u2']) {
    await db.execute({
      sql: 'INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, ?, ?)',
      args: [id, id, 10000, 1],
    });
  }
});

describe('performWebPulls dengan stok terbatas', () => {
  it('pull pertama sukses, pull kedua SOLD_OUT dan XP direfund penuh', async () => {
    const first = await performWebPulls('u1', 'u1', 1, '2026-10-22');
    assert.equal(first.error, undefined);
    assert.equal(first.pulls.length, 1);
    assert.equal(first.pulls[0].rarity, 'Epic');
    assert.equal(first.pulls[0].stockLeft, 0);
    assert.equal(first.costTotal, 500);

    const second = await performWebPulls('u2', 'u2', 1, '2026-10-22');
    assert.equal(second.error, 'SOLD_OUT');
    assert.equal(second.costTotal, 500);

    const xp = await db.execute({
      sql: 'SELECT user_id, xp FROM user_stats ORDER BY user_id',
      args: [],
    });
    assert.deepEqual(xp.rows.map((r) => [r.user_id, Number(r.xp)]), [['u1', 9500], ['u2', 10000]]);

    const cards = await db.execute({ sql: 'SELECT user_id, char_name FROM user_cards', args: [] });
    assert.equal(cards.rows.length, 1);
    assert.equal(cards.rows[0].user_id, 'u1');
  });
});
