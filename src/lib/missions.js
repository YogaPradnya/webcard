import { getDb } from './db.js';

// Misi harian (reset 00:00 WIB) & mingguan (reset Senin 00:00 WIB).
// Progres dicatat otomatis dari event game; klaim manual via tombol (XP masuk user_stats).

export const DAILY_MISSIONS = [
  { id: 'gacha_1', label: 'Gacha 1x', target: 1, xp: 100, event: 'gacha' },
  { id: 'battle_1', label: 'Main battle 1x (AI/PvP)', target: 1, xp: 50, event: 'battle' },
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
];

export function jakartaDateKey(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// Kunci minggu: tanggal Senin (WIB) minggu berjalan.
export function jakartaWeekKey(d = new Date()) {
  const wib = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const day = wib.getDay(); // 0=Min .. 6=Sab
  const diff = (day + 6) % 7; // hari sejak Senin
  wib.setDate(wib.getDate() - diff);
  const y = wib.getFullYear();
  const m = String(wib.getMonth() + 1).padStart(2, '0');
  const dd = String(wib.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function calcLevel(xp) {
  let lv = 1;
  while (xp >= Math.floor(20 * Math.pow(lv, 3))) lv++;
  return lv;
}

export async function ensureMissionTables() {
  const db = getDb();
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

// Catat event game ke progres periode berjalan (harian + mingguan sekaligus).
// event: 'gacha' | 'battle' | 'pvp' | 'pvp_win' | 'trade' | 'login'. n = jumlah.
export async function recordEvent(userId, username, event, n = 1) {
  const amount = Math.max(1, Math.floor(Number(n) || 1));
  try {
    await ensureMissionTables();
    const db = getDb();
    const periods = [
      { key: `d:${jakartaDateKey()}`, list: DAILY_MISSIONS },
      { key: `w:${jakartaWeekKey()}`, list: WEEKLY_MISSIONS },
    ];
    for (const { key, list } of periods) {
      const targets = list.filter((m) => m.event === event);
      if (targets.length === 0) continue;
      for (const m of targets) {
        await db.execute({
          sql: `INSERT INTO mission_progress (user_id, period, mission_id, count) VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, period, mission_id) DO UPDATE SET count = MIN(?, count + ?)`,
          args: [String(userId), key, m.id, Math.min(amount, m.target), m.target, amount],
        });
      }
    }
    if (username) {
      await db.execute({
        sql: `INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, 0, 1)
              ON CONFLICT(user_id) DO UPDATE SET username = excluded.username`,
        args: [String(userId), String(username)],
      }).catch(() => {});
    }
  } catch { /* misi non-kritis: jangan gagalkan game */ }
}

export async function getMissionStatus(userId) {
  await ensureMissionTables();
  const db = getDb();
  const dayKey = `d:${jakartaDateKey()}`;
  const weekKey = `w:${jakartaWeekKey()}`;
  async function fill(list, period) {
    const progRes = await db.execute({
      sql: 'SELECT mission_id, count FROM mission_progress WHERE user_id = ? AND period = ?',
      args: [String(userId), period],
    });
    const prog = {};
    for (const r of progRes.rows || []) prog[String(r.mission_id)] = Number(r.count) || 0;
    const claimRes = await db.execute({
      sql: 'SELECT mission_id FROM mission_claims WHERE user_id = ? AND period = ?',
      args: [String(userId), period],
    });
    const claimed = new Set((claimRes.rows || []).map((r) => String(r.mission_id)));
    return list.map((m) => {
      const count = Math.min(m.target, prog[m.id] || 0);
      const done = count >= m.target;
      return { ...m, count, done, claimed: claimed.has(m.id), canClaim: done && !claimed.has(m.id) };
    });
  }
  return {
    dayKey,
    weekKey,
    daily: await fill(DAILY_MISSIONS, dayKey),
    weekly: await fill(WEEKLY_MISSIONS, weekKey),
  };
}

// Klaim XP misi yang sudah selesai & belum diklaim.
export async function claimMission(userId, username, periodKind, missionId) {
  const list = periodKind === 'weekly' ? WEEKLY_MISSIONS : DAILY_MISSIONS;
  const m = list.find((x) => x.id === String(missionId));
  if (!m) return { ok: false, error: 'Misi tidak dikenal.' };
  const period = periodKind === 'weekly' ? `w:${jakartaWeekKey()}` : `d:${jakartaDateKey()}`;
  await ensureMissionTables();
  const db = getDb();
  const progRes = await db.execute({
    sql: 'SELECT count FROM mission_progress WHERE user_id = ? AND period = ? AND mission_id = ?',
    args: [String(userId), period, m.id],
  });
  const count = progRes.rows.length > 0 ? Number(progRes.rows[0].count) || 0 : 0;
  if (count < m.target) return { ok: false, error: `Belum selesai (${count}/${m.target}).` };
  const claimRes = await db.execute({
    sql: 'SELECT mission_id FROM mission_claims WHERE user_id = ? AND period = ? AND mission_id = ?',
    args: [String(userId), period, m.id],
  });
  if (claimRes.rows.length > 0) return { ok: false, error: 'Sudah diklaim.' };
  const xpRes = await db.execute({ sql: 'SELECT xp FROM user_stats WHERE user_id = ?', args: [String(userId)] });
  const curXp = xpRes.rows.length > 0 ? Number(xpRes.rows[0].xp) || 0 : 0;
  const newXp = curXp + m.xp;
  await db.execute({
    sql: `INSERT INTO user_stats (user_id, username, xp, level) VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET xp = excluded.xp, level = excluded.level, username = excluded.username`,
    args: [String(userId), String(username || ''), newXp, calcLevel(newXp)],
  });
  await db.execute({
    sql: 'INSERT INTO mission_claims (user_id, period, mission_id, xp, claimed_at) VALUES (?, ?, ?, ?, ?)',
    args: [String(userId), period, m.id, m.xp, Date.now()],
  });
  return { ok: true, xp: m.xp, newXp };
}
