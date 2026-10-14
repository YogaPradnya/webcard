-- 001: tabel milik WEB untuk battle (rooms, leaderboard, riwayat, limit harian).
-- Idempoten: aman dijalankan ulang (IF NOT EXISTS).
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
);
CREATE INDEX IF NOT EXISTS idx_battle_p1 ON battle_rooms (p1_id);
CREATE INDEX IF NOT EXISTS idx_battle_waiting ON battle_rooms (mode, status, created_at);
CREATE TABLE IF NOT EXISTS battle_leaderboard (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL
);
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
);
CREATE INDEX IF NOT EXISTS idx_bhist_user ON battle_history (p1_id, p2_id, created_at DESC);
CREATE TABLE IF NOT EXISTS battle_daily (
  user_id TEXT NOT NULL, day_key TEXT NOT NULL, plays INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, day_key)
);
