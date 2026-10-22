import { getDb } from './db.js';
import { isSchemaReady } from './schema.js';
import { calcLevel } from './level.js';
import { jakartaDateKey, jakartaWeekKey } from './jakartaTime.js';

export { jakartaDateKey, jakartaWeekKey, calcLevel };

// Misi harian (reset 00:00 WIB) & mingguan (reset Senin 00:00 WIB).
// Progres dicatat otomatis dari event game; klaim manual via tombol (XP masuk user_stats).

export const DAILY_MISSIONS = [
  { id: 'gacha_1', label: 'Gacha 1x', target: 1, xp: 100, event: 'gacha' },
  { id: 'pvp_1', label: 'Battle vs teman 1x', target: 1, xp: 150, event: 'pvp' },
  { id: 'pvp_5', label: 'Battle vs teman 5x', target: 5, xp: 400, event: 'pvp' },
  { id: 'pvp_win_1', label: 'Menang vs teman 1x', target: 1, xp: 200, event: 'pvp_win' },
  { id: 'trade_1', label: 'Trade 1x', target: 1, xp: 100, event: 'trade' },
  { id: 'login_1', label: 'Buka web hari ini', target: 1, xp: 25, event: 'login' },
];

export const WEEKLY_MISSIONS = [
  { id: 'gacha_15', label: 'Gacha 15x', target: 15, xp: 800, event: 'gacha' },
  { id: 'battle_15', label: 'Main battle 15x (AI/PvP)', target: 15, xp: 500, event: 'battle' },
  { id: 'pvp_25', label: 'Battle vs teman 25x', target: 25, xp: 1500, event: 'pvp' },
  { id: 'pvp_win_5', label: 'Menang vs teman 5x', target: 5, xp: 1000, event: 'pvp_win' },
  { id: 'trade_5', label: 'Trade 5x', target: 5, xp: 500, event: 'trade' },
  { id: 'topup_1', label: 'Top-Up 1x', target: 1, xp: 500, event: 'topup' },
];

async function ensureMissionTablesOn(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS mission_progress (
      user_id TEXT NOT NULL,
      period TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      count INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, period, mission_id)
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS mission_claims (
      user_id TEXT NOT NULL,
      period TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      xp INTEGER DEFAULT 0,
      claimed_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, period, mission_id)
    )
  `);
}

export async function ensureMissionTables() {
  if (isSchemaReady()) return; // DDL sudah diurus migrasi (0 round-trip).
  await ensureMissionTablesOn(getDb());
}

// Dedupe login harian lintas-bundle: /api/missions & /api/profile/summary
// sama-sama mencatat 'login'. Tanpa ini tiap buka profil = 2-3 upsert tulis
// yang berebut write-lock di sqld dan ikut menahan query lain.
const LOGIN_DEDUPE_KEY = '__animeinLoginRecordedV1';

function loginDedupe(userId) {
  let set = globalThis[LOGIN_DEDUPE_KEY];
  if (!set) {
    set = new Set();
    globalThis[LOGIN_DEDUPE_KEY] = set;
  }
  return { set, key: `${String(userId)}:${jakartaDateKey()}` };
}

// Catat event game ke progres periode berjalan (harian + mingguan sekaligus).
// event: 'gacha' | 'battle' | 'pvp' | 'pvp_win' | 'trade' | 'topup' | 'login'. n = jumlah.
export async function recordEvent(userId, username, event, n = 1) {
  const amount = Math.max(1, Math.floor(Number(n) || 1));
  let dedupe = null;
  if (event === 'login') {
    const d = loginDedupe(userId);
    if (d.set.has(d.key)) return;
    if (d.set.size > 5000) d.set.clear();
    d.set.add(d.key);
    dedupe = d;
  }
  try {
    await ensureMissionTables();
    const db = getDb();
    const periods = [
      { key: `d:${jakartaDateKey()}`, list: DAILY_MISSIONS },
      { key: `w:${jakartaWeekKey()}`, list: WEEKLY_MISSIONS },
    ];
    // 1 round-trip via batch (dulu N insert berurutan ke Tokyo).
    // Transaksional & best-effort: gagal -> abaikan seperti sebelumnya.
    const stmts = [];
    for (const { key, list } of periods) {
      for (const m of list.filter((x) => x.event === event)) {
        stmts.push({
          sql: `INSERT INTO mission_progress (user_id, period, mission_id, count) VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, period, mission_id) DO UPDATE SET count = MIN(?, count + ?)`,
          args: [String(userId), key, m.id, Math.min(amount, m.target), m.target, amount],
        });
      }
    }
    if (username) {
      stmts.push({
        sql: `INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, 0, 1)
              ON CONFLICT(user_id) DO UPDATE SET username = excluded.username`,
        args: [String(userId), String(username)],
      });
    }
    // JANGAN db.batch: patologi Turso (insiden 17 Okt) = batch tulis/multi
    // statement ~30-45 dtk per statement (timeout 503). execute tunggal
    // ~0,5-1 dtk; dijalankan paralel karena upsert-nya independen.
    if (stmts.length > 0) await Promise.all(stmts.map((s) => db.execute(s)));
  } catch {
    // Gagal tulis: izinkan percobaan berikutnya (jangan dedupe kegagalan).
    if (dedupe) dedupe.set.delete(dedupe.key);
    /* misi non-kritis: jangan gagalkan game */
  }
}

export async function getMissionStatus(userId) {
  await ensureMissionTables();
  const db = getDb();
  const dayKey = `d:${jakartaDateKey()}`;
  const weekKey = `w:${jakartaWeekKey()}`;
  // 2 gelombang paralel (dulu 4 query berurutan ke Tokyo).
  const [progRes, claimRes] = await Promise.all([
    db.execute({
      sql: 'SELECT mission_id, period, count FROM mission_progress WHERE user_id = ? AND period IN (?, ?)',
      args: [String(userId), dayKey, weekKey],
    }),
    db.execute({
      sql: 'SELECT mission_id, period FROM mission_claims WHERE user_id = ? AND period IN (?, ?)',
      args: [String(userId), dayKey, weekKey],
    }),
  ]);
  const progByPeriod = { [dayKey]: {}, [weekKey]: {} };
  for (const r of progRes.rows || []) {
    const p = String(r.period);
    if (progByPeriod[p]) progByPeriod[p][String(r.mission_id)] = Number(r.count) || 0;
  }
  const claimedByPeriod = { [dayKey]: new Set(), [weekKey]: new Set() };
  for (const r of claimRes.rows || []) {
    const p = String(r.period);
    if (claimedByPeriod[p]) claimedByPeriod[p].add(String(r.mission_id));
  }
  function fill(list, period) {
    const prog = progByPeriod[period] || {};
    const claimed = claimedByPeriod[period] || new Set();
    return list.map((m) => {
      const count = Math.min(m.target, prog[m.id] || 0);
      const done = count >= m.target;
      return { ...m, count, done, claimed: claimed.has(m.id), canClaim: done && !claimed.has(m.id) };
    });
  }
  return {
    dayKey,
    weekKey,
    daily: fill(DAILY_MISSIONS, dayKey),
    weekly: fill(WEEKLY_MISSIONS, weekKey),
  };
}

// Klaim XP misi yang sudah selesai & belum diklaim.
// INSERT claims dulu sebagai mutex (cegah double-click), baru tambah XP.
export async function claimMission(userId, username, periodKind, missionId) {
  await ensureMissionTables();
  return claimMissionWithDb(getDb(), userId, username, periodKind, missionId);
}

// Versi yang bisa diuji dengan DB injection. Duplicate claim sengaja
// dikembalikan sebagai sukses idempoten supaya double-click/retry tidak
// memunculkan error 400 dan UI bisa langsung menyembunyikan tombol.
export async function claimMissionWithDb(db, userId, username, periodKind, missionId, opts = {}) {
  const list = periodKind === 'weekly' ? WEEKLY_MISSIONS : DAILY_MISSIONS;
  const m = list.find((x) => x.id === String(missionId));
  if (!m) return { ok: false, error: 'Misi tidak dikenal.' };
  const period = periodKind === 'weekly' ? `w:${jakartaWeekKey()}` : `d:${jakartaDateKey()}`;
  if (opts.ensureTables) await ensureMissionTablesOn(db);
  const progRes = await db.execute({
    sql: 'SELECT count FROM mission_progress WHERE user_id = ? AND period = ? AND mission_id = ?',
    args: [String(userId), period, m.id],
  });
  const count = progRes.rows.length > 0 ? Number(progRes.rows[0].count) || 0 : 0;
  if (count < m.target) return { ok: false, error: `Belum selesai (${count}/${m.target}).` };
  try {
    await db.execute({
      sql: 'INSERT INTO mission_claims (user_id, period, mission_id, xp, claimed_at) VALUES (?, ?, ?, ?, ?)',
      args: [String(userId), period, m.id, m.xp, Date.now()],
    });
  } catch (insertError) {
    // Bedakan "sudah diklaim" dari gangguan DB. Kalau row klaim memang ada,
    // kembalikan 200 idempoten; kalau tidak, biarkan route melaporkan 500.
    const existing = await db.execute({
      sql: 'SELECT xp FROM mission_claims WHERE user_id = ? AND period = ? AND mission_id = ?',
      args: [String(userId), period, m.id],
    }).catch(() => null);
    if (existing?.rows?.length) {
      const { getUserXp } = await import('./userCardsRepo.js');
      const newXp = await getUserXp(db, userId);
      return {
        ok: true,
        alreadyClaimed: true,
        xp: 0,
        claimedXp: Number(existing.rows[0].xp) || m.xp,
        newXp,
      };
    }
    return { ok: false, error: 'Gagal klaim misi.', status: 500, cause: insertError };
  }
  // XP ditambah secara atomik (bukan read-modify-write) supaya klaim misi
  // yang bersamaan dengan top-up/gacha tidak saling menimpa.
  let xpRes;
  try {
    xpRes = await db.execute({
      sql: `INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              xp = MAX(0, user_stats.xp + ?),
              username = CASE WHEN user_stats.username IS NULL OR user_stats.username = ''
                THEN excluded.username ELSE user_stats.username END
            RETURNING xp`,
      args: [String(userId), String(username || ''), m.xp, calcLevel(m.xp), m.xp],
    });
  } catch (xpError) {
    // XP gagal masuk -> lepas lagi klaim agar user bisa retry. Tanpa ini,
    // klaim tersimpan permanen dengan xp=0 dan user tidak pernah dapat hadiah.
    await db.execute({
      sql: 'DELETE FROM mission_claims WHERE user_id = ? AND period = ? AND mission_id = ?',
      args: [String(userId), period, m.id],
    }).catch(() => {});
    return { ok: false, error: 'Gagal menambah XP misi.', status: 500, cause: xpError };
  }
  const newXp = Math.max(0, Number(xpRes?.rows?.[0]?.xp) || 0);
  await db.execute({
    sql: 'UPDATE user_stats SET level = ? WHERE user_id = ?',
    args: [calcLevel(newXp), String(userId)],
  }).catch(() => {});
  return { ok: true, xp: m.xp, newXp };
}
