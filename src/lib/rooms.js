import { getDb } from './db.js';
import { createBattle, act as engineAct, aiChoose } from './engine.js';

export const TURN_TIMEOUT_MS = 60 * 1000;
export const ROOM_TTL_MS = 30 * 60 * 1000;
// Default XP battle (bisa diubah dari dashboard bot: menu Web Kartu).
export const WIN_XP = 100;
export const LOSE_XP = 20;
export const DAILY_CAP = 10;

async function readBattleRewards() {
  const out = { winXp: WIN_XP, loseXp: LOSE_XP, dailyCap: DAILY_CAP };
  try {
    const db = getDb();
    const pairs = { web_battle_xp_win: 'winXp', web_battle_xp_lose: 'loseXp', web_battle_daily_cap: 'dailyCap' };
    for (const [key, field] of Object.entries(pairs)) {
      try {
        const r = await db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] });
        if (r.rows.length > 0 && r.rows[0].value != null && r.rows[0].value !== '') {
          const n = parseInt(r.rows[0].value, 10);
          if (Number.isFinite(n)) out[field] = n;
        }
      } catch (_) { /* default */ }
    }
  } catch (_) { /* default */ }
  out.winXp = Math.min(10000, Math.max(0, out.winXp));
  out.loseXp = Math.min(10000, Math.max(0, out.loseXp));
  out.dailyCap = Math.min(100, Math.max(1, out.dailyCap));
  return out;
}

export function genRoomCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += String(Math.floor(Math.random() * 10));
  return code;
}

export function normalizeRoomCode(value) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 12);
}

export async function ensureBattleRooms() {
  const db = getDb();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS battle_rooms (
      code TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'ai',
      p1_id TEXT NOT NULL,
      p1_username TEXT NOT NULL DEFAULT '',
      p2_id TEXT DEFAULT NULL,
      p2_username TEXT NOT NULL DEFAULT '',
      p1_team TEXT NOT NULL DEFAULT '[]',
      state TEXT NOT NULL DEFAULT '{}',
      turn TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'waiting',
      winner TEXT DEFAULT NULL,
      result TEXT DEFAULT NULL,
      xp_paid INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_battle_p1 ON battle_rooms (p1_id)');
  await db.execute(`
    CREATE TABLE IF NOT EXISTS battle_leaderboard (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL DEFAULT '',
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      updated_at INTEGER NOT NULL
    )
  `);
}

function jakartaDateKey(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function calcLevel(xp) {
  let lv = 1;
  while (xp >= Math.floor(20 * Math.pow(lv, 3))) lv++;
  return lv;
}

export function parseRoom(row) {
  return {
    code: String(row.code),
    mode: String(row.mode || 'ai'),
    p1Id: String(row.p1_id),
    p1Username: String(row.p1_username || ''),
    p2Id: row.p2_id ? String(row.p2_id) : null,
    p2Username: String(row.p2_username || ''),
    p1Team: JSON.parse(row.p1_team || '[]'),
    battle: JSON.parse(row.state || '{}'),
    turn: row.turn ? String(row.turn) : null,
    status: String(row.status || 'waiting'),
    winner: row.winner ? String(row.winner) : null,
    result: row.result ? JSON.parse(row.result) : null,
    xpPaid: Number(row.xp_paid) === 1,
    updatedAt: Number(row.updated_at) || 0,
  };
}

export async function getRoom(code) {
  const res = await getDb().execute({ sql: 'SELECT * FROM battle_rooms WHERE code = ?', args: [code] });
  if (res.rows.length === 0) return null;
  return parseRoom(res.rows[0]);
}

export async function saveRoom(room) {
  await getDb().execute({
    sql: `UPDATE battle_rooms SET state = ?, turn = ?, status = ?, winner = ?, result = ?,
          xp_paid = ?, p2_id = ?, p2_username = ?, updated_at = ? WHERE code = ?`,
    args: [
      JSON.stringify(room.battle), room.turn, room.status, room.winner,
      room.result ? JSON.stringify(room.result) : null, room.xpPaid ? 1 : 0,
      room.p2Id, room.p2Username, Date.now(), room.code,
    ],
  });
}

export function sideOf(room, userId) {
  if (String(userId) === String(room.p1Id)) return 'player';
  if (room.p2Id && String(userId) === String(room.p2Id)) return 'enemy';
  return null;
}

export function userIdOfSide(room, side) {
  if (side === 'player') return room.p1Id;
  return room.p2Id || 'AI';
}

// Mainkan AI selama giliran AI (mode ai). Return jumlah aksi AI.
export function playAiTurns(room) {
  const battle = room.battle;
  let n = 0;
  while (!battle.over && room.mode === 'ai' && room.turn === 'AI') {
    engineAct(battle, 'enemy', aiChoose(battle, 'enemy'));
    n += 1;
    if (!battle.over) room.turn = String(room.p1Id);
    if (n > 200) break;
  }
  return n;
}

// Timeout 60 dtk: sisi yang ber giliran otomatis ATK biasa.
export function applyTimeout(room, now = Date.now()) {
  if (room.status !== 'ongoing' || room.battle.over) return false;
  if (now - room.updatedAt < TURN_TIMEOUT_MS) return false;
  const side = room.turn === String(room.p1Id) ? 'player' : 'enemy';
  const battle = room.battle;
  const team = battle[side];
  const actor = team.fighters[team.active];
  let ok = false;
  if (actor && actor.alive) ok = engineAct(battle, side, { type: 'basic' });
  if (!ok) {
    const bench = team.fighters.map((f, i) => ({ f, i })).find(({ f, i }) => f.alive && i !== team.active);
    if (bench) engineAct(battle, side, { type: 'switch', to: bench.i });
  }
  battle.log.push({ t: battle.turnCount, type: 'timeout', side });
  if (!battle.over) {
    if (room.mode === 'ai') {
      room.turn = String(room.p1Id);
      playAiTurns(room);
    } else {
      room.turn = String(room.turn) === String(room.p1Id) ? String(room.p2Id) : String(room.p1Id);
    }
  }
  return true;
}

async function awardXpFor(db, userId, username, won, rewards) {
  const dayKey = jakartaDateKey();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS battle_daily (
      user_id TEXT NOT NULL, day_key TEXT NOT NULL, plays INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, day_key)
    )
  `);
  const playRes = await db.execute({
    sql: 'SELECT plays FROM battle_daily WHERE user_id = ? AND day_key = ?',
    args: [String(userId), dayKey],
  });
  const plays = playRes.rows.length > 0 ? Number(playRes.rows[0].plays) || 0 : 0;
  if (plays >= rewards.dailyCap) return { gain: 0, capped: true };
  const gain = won ? rewards.winXp : rewards.loseXp;
  await db.execute({
    sql: `INSERT INTO battle_daily (user_id, day_key, plays) VALUES (?, ?, 1)
          ON CONFLICT(user_id, day_key) DO UPDATE SET plays = plays + 1`,
    args: [String(userId), dayKey],
  });
  const xpRes = await db.execute({ sql: 'SELECT xp FROM user_stats WHERE user_id = ?', args: [String(userId)] });
  const curXp = xpRes.rows.length > 0 ? Number(xpRes.rows[0].xp) || 0 : 0;
  const newXp = curXp + gain;
  await db.execute({
    sql: `INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level`,
    args: [String(userId), String(username || ''), newXp, calcLevel(newXp)],
  });
  return { gain, capped: false, newXp };
}

// Selesaikan room bila battle over. Return { finished, xp } (xp per userId).
export async function finishIfOver(room) {
  const battle = room.battle;
  if (!battle.over || room.status === 'finished') return { finished: room.status === 'finished', xp: room.result?.xp || {} };
  room.status = 'finished';
  const winnerSide = battle.winner === 'you' ? 'player' : 'enemy';
  room.winner = userIdOfSide(room, winnerSide);
  const xp = {};
  // XP + leaderboard hanya untuk PvP. Vs AI: tanpa XP, tanpa leaderboard.
  if (room.mode !== 'pvp') {
    room.xpPaid = true;
    room.result = { winner: room.winner, xp };
    return { finished: true, xp };
  }
  if (!room.xpPaid) {
    const db = getDb();
    const rewards = await readBattleRewards();
    const humans = [
      { id: room.p1Id, username: room.p1Username },
      ...(room.p2Id ? [{ id: room.p2Id, username: room.p2Username }] : []),
    ];
    for (const h of humans) {
      try {
        const won = String(room.winner) === String(h.id);
        const r = await awardXpFor(db, h.id, h.username, won, rewards);
        xp[String(h.id)] = r;
        await db.execute({
          sql: `INSERT INTO battle_leaderboard (user_id, username, wins, losses, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET username = excluded.username,
                wins = wins + ?, losses = losses + ?, updated_at = excluded.updated_at`,
          args: [String(h.id), String(h.username || ''), won ? 1 : 0, won ? 0 : 1, Date.now(), won ? 1 : 0, won ? 0 : 1],
        });
      } catch (e) {
        console.error('[BATTLE XP]', e.message);
        xp[String(h.id)] = { gain: 0, capped: false };
      }
    }
    room.xpPaid = true;
  }
  room.result = { winner: room.winner, xp };
  return { finished: true, xp };
}
