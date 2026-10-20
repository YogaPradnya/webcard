import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { claimMissionWithDb, jakartaDateKey } from '../../src/lib/missions.js';

async function makeDb() {
  const db = createClient({ url: 'file::memory:' });
  await db.execute(`
    CREATE TABLE mission_progress (
      user_id TEXT NOT NULL,
      period TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, period, mission_id)
    )
  `);
  await db.execute(`
    CREATE TABLE mission_claims (
      user_id TEXT NOT NULL,
      period TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      xp INTEGER DEFAULT 0,
      claimed_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, period, mission_id)
    )
  `);
  await db.execute(`
    CREATE TABLE user_stats (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL DEFAULT '',
      xp INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1
    )
  `);
  return db;
}

describe('claim misi', () => {
  it('klaim pertama menambah XP, klaim kedua idempoten tanpa double XP', async () => {
    const db = await makeDb();
    const period = `d:${jakartaDateKey()}`;
    await db.execute({
      sql: 'INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, ?, ?)',
      args: ['u1', 'Tester', 100, 1],
    });
    await db.execute({
      sql: 'INSERT INTO mission_progress (user_id, period, mission_id, count) VALUES (?, ?, ?, ?)',
      args: ['u1', period, 'login_1', 1],
    });

    const first = await claimMissionWithDb(db, 'u1', 'Tester', 'daily', 'login_1', { ensureTables: true });
    assert.equal(first.ok, true);
    assert.equal(first.xp, 25);
    assert.equal(first.newXp, 125);

    const second = await claimMissionWithDb(db, 'u1', 'Tester', 'daily', 'login_1', { ensureTables: true });
    assert.equal(second.ok, true);
    assert.equal(second.alreadyClaimed, true);
    assert.equal(second.xp, 0);
    assert.equal(second.newXp, 125);

    const claims = await db.execute('SELECT xp FROM mission_claims WHERE user_id = ?', ['u1']);
    assert.equal(claims.rows.length, 1);
    const stats = await db.execute('SELECT xp FROM user_stats WHERE user_id = ?', ['u1']);
    assert.equal(Number(stats.rows[0].xp), 125);
    db.close();
  });

  it('menolak klaim kalau progres belum selesai', async () => {
    const db = await makeDb();
    const period = `d:${jakartaDateKey()}`;
    await db.execute({
      sql: 'INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, ?, ?)',
      args: ['u1', 'Tester', 100, 1],
    });
    await db.execute({
      sql: 'INSERT INTO mission_progress (user_id, period, mission_id, count) VALUES (?, ?, ?, ?)',
      args: ['u1', period, 'login_1', 0],
    });
    const r = await claimMissionWithDb(db, 'u1', 'Tester', 'daily', 'login_1', { ensureTables: true });
    assert.equal(r.ok, false);
    assert.match(r.error, /Belum selesai/);
    db.close();
  });
});
