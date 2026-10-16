import { getDb } from './db.js';
import { isSchemaReady } from './schema.js';
import { createBattle, act as engineAct, aiChoose } from './engine.js';
import { calcLevel } from './level.js';
import { jakartaDateKey } from './jakartaTime.js';
import { randomDigits } from './codes.js';
import { getUserXp } from './userCardsRepo.js';

export const TURN_TIMEOUT_MS = 60 * 1000;
// Forfeit: 2 menit tanpa aksi manual dianggap menyerah (permintaan user).
export const FORFEIT_TIMEOUT_MS = 2 * 60 * 1000;
export const ROOM_TTL_MS = 30 * 60 * 1000;
// Room PvP yang masih menunggu lawan: hangus dalam 5 menit bila tidak ada yang gabung.
export const WAITING_TTL_MS = 5 * 60 * 1000;
// Default XP battle (bisa diubah dari dashboard bot: menu Web Kartu).
export const WIN_XP = 100;
export const LOSE_XP = 20;
export const DAILY_CAP = 10;

async function readBattleRewards() {
  const out = { winXp: WIN_XP, loseXp: LOSE_XP, dailyCap: DAILY_CAP };
  try {
    const db = getDb();
    const pairs = { web_battle_xp_win: 'winXp', web_battle_xp_lose: 'loseXp', web_battle_daily_cap: 'dailyCap' };
    // Paralel: 3 round-trip Tokyo -> 1 gelombang.
    const rows = await Promise.all(
      Object.keys(pairs).map((key) =>
        db.execute({ sql: 'SELECT value FROM settings WHERE key = ?', args: [key] })
          .then((r) => ({ key, row: r.rows[0] }))
          .catch(() => ({ key, row: null })),
      ),
    );
    for (const { key, row } of rows) {
      const v = row?.value;
      if (v != null && v !== '') {
        const n = parseInt(v, 10);
        if (Number.isFinite(n)) out[pairs[key]] = n;
      }
    }
  } catch (_) { /* default */ }
  out.winXp = Math.min(10000, Math.max(0, out.winXp));
  out.loseXp = Math.min(10000, Math.max(0, out.loseXp));
  out.dailyCap = Math.min(100, Math.max(1, out.dailyCap));
  return out;
}

export function genRoomCode() {
  return randomDigits(6);
}

export function normalizeRoomCode(value) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 12);
}

// DDL hanya sekali per proses (TTL 10 menit). Sebelumnya tiap API battle
// menjalankan 6x CREATE/INDEX ke Turso Tokyo (~1-2 detik per request,
// halaman battle memanggilnya 3-4x sequential = 5-6 detik sendiri).
let _roomsReadyAt = 0;
let _roomsPromise = null;
const ROOMS_DDL_TTL_MS = 10 * 60 * 1000;
export async function ensureBattleRooms() {
  if (isSchemaReady()) return; // DDL sudah diurus migrasi (0 round-trip).
  const now = Date.now();
  if (now - _roomsReadyAt < ROOMS_DDL_TTL_MS) return;
  if (_roomsPromise) { await _roomsPromise; return; }
  _roomsPromise = (async () => {
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
  await db.execute('CREATE INDEX IF NOT EXISTS idx_battle_waiting ON battle_rooms (mode, status, created_at)');
  await db.execute(`
    CREATE TABLE IF NOT EXISTS battle_leaderboard (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL DEFAULT '',
      wins INTEGER DEFAULT 0,
      losses INTEGER DEFAULT 0,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS battle_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'pvp',
      p1_id TEXT NOT NULL,
      p1_username TEXT NOT NULL DEFAULT '',
      p2_id TEXT DEFAULT NULL,
      p2_username TEXT NOT NULL DEFAULT '',
      winner_id TEXT DEFAULT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_bhist_user ON battle_history (p1_id, p2_id, created_at DESC)');
  })();
  try {
    await _roomsPromise;
    _roomsReadyAt = Date.now();
  } finally {
    _roomsPromise = null;
  }
}

export function parseRoom(row) {
  const safeJson = (v, fb) => {
    try {
      const p = JSON.parse(v ?? '');
      return p ?? fb;
    } catch {
      return fb;
    }
  };
  return {
    code: String(row.code),
    mode: String(row.mode || 'ai'),
    p1Id: String(row.p1_id),
    p1Username: String(row.p1_username || ''),
    p2Id: row.p2_id ? String(row.p2_id) : null,
    p2Username: String(row.p2_username || ''),
    p1Team: safeJson(row.p1_team, []),
    battle: safeJson(row.state, {}),
    turn: row.turn ? String(row.turn) : null,
    status: String(row.status || 'waiting'),
    winner: row.winner ? String(row.winner) : null,
    result: row.result ? safeJson(row.result, null) : null,
    xpPaid: Number(row.xp_paid) === 1,
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  };
}

export function isWaitingExpired(room, now = Date.now()) {
  if (!room || room.mode !== 'pvp' || room.status !== 'waiting') return false;
  return now - (Number(room.createdAt) || 0) > WAITING_TTL_MS;
}

export function waitingSecondsLeft(room, now = Date.now()) {
  const left = WAITING_TTL_MS - (now - (Number(room.createdAt) || 0));
  return Math.max(0, Math.ceil(left / 1000));
}

export async function deleteRoom(code) {
  _roomCache.delete(String(code));
  await getDb().execute({ sql: 'DELETE FROM battle_rooms WHERE code = ?', args: [String(code)] });
}

export async function cleanupExpiredWaitingRooms(now = Date.now()) {
  try {
    await getDb().execute({
      sql: `DELETE FROM battle_rooms WHERE mode = 'pvp' AND status = 'waiting' AND created_at < ?`,
      args: [now - WAITING_TTL_MS],
    });
  } catch (_) { /* tabel belum ada -> abaikan */ }
}

export async function getRoom(code) {
  const res = await getDb().execute({ sql: 'SELECT * FROM battle_rooms WHERE code = ?', args: [code] });
  if (res.rows.length === 0) return null;
  return parseRoom(res.rows[0]);
}

// Cache baca room di memori proses (TTL 2 dtk): polling/streaming tiap
// klien tiap 2,5–15 dtk tidak lagi kena round-trip Tokyo. Tulis tetap ke
// Turso via saveRoom (write-through) agar single source of truth terjaga.
// Klon saat baca agar mutasi antar-request tidak berbagi objek.
const _roomCache = new Map(); // code -> { room, at }
const ROOM_CACHE_TTL_MS = 2000;

function cloneRoom(room) {
  if (!room) return room;
  try {
    return typeof structuredClone === 'function' ? structuredClone(room) : JSON.parse(JSON.stringify(room));
  } catch {
    return room;
  }
}

export async function getRoomCached(code, ttlMs = ROOM_CACHE_TTL_MS) {
  const key = String(code);
  const hit = _roomCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return cloneRoom(hit.room);
  const room = await getRoom(key);
  if (room) _roomCache.set(key, { room, at: Date.now() });
  else _roomCache.delete(key);
  return room ? cloneRoom(room) : room;
}

export function touchRoomCache(room) {
  if (room?.code) _roomCache.set(String(room.code), { room, at: Date.now() });
}

// Log battle di-cap agar JSON state tidak membengkak (payload + parse
// makin berat tiap aksi). Klien sudah tahan trimming (reset seenLog).
export const MAX_BATTLE_LOG = 300;

export function trimBattleLog(battle) {
  if (battle && Array.isArray(battle.log) && battle.log.length > MAX_BATTLE_LOG) {
    battle.log = battle.log.slice(-MAX_BATTLE_LOG);
  }
  return battle;
}

export async function saveRoom(room) {
  trimBattleLog(room.battle);
  await getDb().execute({
    sql: `UPDATE battle_rooms SET state = ?, turn = ?, status = ?, winner = ?, result = ?,
          xp_paid = ?, p2_id = ?, p2_username = ?, updated_at = ? WHERE code = ?`,
    args: [
      JSON.stringify(room.battle), room.turn, room.status, room.winner,
      room.result ? JSON.stringify(room.result) : null, room.xpPaid ? 1 : 0,
      room.p2Id, room.p2Username, Date.now(), room.code,
    ],
  });
  touchRoomCache(room);
}

export function sideOf(room, userId) {
  if (String(userId) === String(room.p1Id)) return 'player';
  if (room.p2Id && String(userId) === String(room.p2Id)) return 'enemy';
  return null;
}

// State publik untuk klien (dipakai GET room, SSE stream, rematch).
export function publicState(room, youId) {
  return {
    code: room.code,
    mode: room.mode,
    status: room.status,
    turn: room.turn,
    you: String(youId),
    yourSide: sideOf(room, youId),
    p1Username: room.p1Username,
    p2Username: room.p2Username,
    battle: room.battle,
    winner: room.winner,
    result: room.result,
    updatedAt: room.updatedAt,
    forfeitMsLeft: forfeitMsLeft(room, Date.now()),
    forfeitTimeoutMs: FORFEIT_TIMEOUT_MS,
  };
}

// Nama 3 kartu milik userId di room (untuk rematch: tim penantang).
export function sideTeamNames(room, userId) {
  const side = sideOf(room, userId);
  if (!side) return [];
  const team = room.battle?.[side];
  if (!team?.fighters) return [];
  const names = team.fighters.map((f) => String(f?.name || '').trim()).filter(Boolean);
  if (names.length !== 3 || new Set(names.map((n) => n.toLowerCase())).size !== 3) return [];
  return names;
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

// Timeout 60 dtk: sisi yang bergiliran otomatis ATK biasa (legacy, dipakai mode AI saja).
// PvP memakai forfeit 2 menit (applyForfeit) agar game berakhir bila lawan AFK.
export function applyTimeout(room, now = Date.now()) {
  if (room.status !== 'ongoing' || room.battle.over) return false;
  // PvP: jangan auto-ATK, biarkan applyForfeit yang menangani (2 menit -> menyerah).
  if (room.mode === 'pvp') return false;
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

// 2 menit tanpa aksi -> pihak yang dapat giliran dianggap menyerah, game berakhir.
// Berlaku untuk PvP dan vs AI (pemain AFK kalah). Return true bila forfeit terjadi.
export function applyForfeit(room, now = Date.now()) {
  if (room.status !== 'ongoing' || room.battle.over) return false;
  if (now - room.updatedAt < FORFEIT_TIMEOUT_MS) return false;
  const turnId = String(room.turn || '');
  const p1 = String(room.p1Id);
  const p2 = room.p2Id ? String(room.p2Id) : 'AI';
  // Tentukan sisi yang menyerah dari turn holder.
  let loserSide = 'player';
  let winnerSide = 'enemy';
  if (room.mode === 'ai') {
    // Vs AI: hanya pemain yang bisa forfeit (AI selalu jalan instan).
    loserSide = 'player';
    winnerSide = 'enemy';
  } else if (turnId === p2) {
    loserSide = 'enemy';
    winnerSide = 'player';
  } else {
    loserSide = 'player';
    winnerSide = 'enemy';
  }
  room.battle.turnCount += 1;
  room.battle.over = true;
  // 'you' = player menang, 'ai' = enemy menang (konvensi engine).
  room.battle.winner = winnerSide === 'player' ? 'you' : 'ai';
  room.battle.log.push({
    t: room.battle.turnCount,
    type: 'forfeit',
    side: loserSide,
    reason: 'timeout-2m',
  });
  return true;
}

// Sisa waktu sebelum forfeit (ms). Untuk countdown UI.
export function forfeitMsLeft(room, now = Date.now()) {
  if (!room || room.status !== 'ongoing' || room.battle?.over) return 0;
  return Math.max(0, FORFEIT_TIMEOUT_MS - (now - (Number(room.updatedAt) || 0)));
}

// Menyerah manual. Return { side } atau null bila tidak valid.
export function surrender(room, userId) {
  if (room.status !== 'ongoing' || room.battle.over) return null;
  const side = sideOf(room, userId);
  if (!side) return null;
  const winnerSide = side === 'player' ? 'enemy' : 'player';
  room.battle.turnCount += 1;
  room.battle.over = true;
  room.battle.winner = winnerSide === 'player' ? 'you' : 'ai';
  room.battle.log.push({ t: room.battle.turnCount, type: 'surrender', side });
  return { side };
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
  const curXp = await getUserXp(db, userId);
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
  const lastLog = Array.isArray(battle.log) ? battle.log[battle.log.length - 1] : null;
  const reason = lastLog?.type === 'forfeit' ? 'forfeit' : lastLog?.type === 'surrender' ? 'surrender' : lastLog?.type === 'end' ? 'ko' : 'battle';
  const xp = {};
  // XP + leaderboard hanya untuk PvP. Vs AI: tanpa XP, tanpa leaderboard.
  if (room.mode !== 'pvp') {
    room.xpPaid = true;
    room.result = { winner: room.winner, xp, reason };
  } else if (!room.xpPaid) {
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
    room.result = { winner: room.winner, xp, reason };
  } else {
    room.result = { winner: room.winner, xp: room.result?.xp || xp, reason };
  }
  // Misi: catat battle selesai (AI/PvP) + menang PvP. Non-kritis, jangan gagalkan finish.
  try {
    const { recordEvent } = await import('./missions.js');
    const isPvp = room.mode === 'pvp';
    const humans = isPvp
      ? [
        { id: room.p1Id, username: room.p1Username },
        ...(room.p2Id ? [{ id: room.p2Id, username: room.p2Username }] : []),
      ]
      : [{ id: room.p1Id, username: room.p1Username }];
    for (const h of humans) {
      await recordEvent(h.id, h.username, 'battle', 1);
      if (isPvp) {
        await recordEvent(h.id, h.username, 'pvp', 1);
        if (String(room.winner) === String(h.id)) {
          await recordEvent(h.id, h.username, 'pvp_win', 1);
        }
      }
    }
  } catch { /* abaikan */ }
  // Catat riwayat (best-effort, jangan gagalkan finish).
  try {
    const db = getDb();
    await db.execute({
      sql: `INSERT INTO battle_history (code, mode, p1_id, p1_username, p2_id, p2_username, winner_id, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [room.code, room.mode, String(room.p1Id), String(room.p1Username || ''),
        room.p2Id ? String(room.p2Id) : null, String(room.p2Username || ''),
        room.winner ? String(room.winner) : null, reason, Date.now()],
    });
  } catch { /* abaikan */ }
  return { finished: true, xp };
}
