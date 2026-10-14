-- 006: tabel milik WEB untuk misi harian/mingguan.
CREATE TABLE IF NOT EXISTS mission_progress (
  user_id TEXT NOT NULL,
  period TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, period, mission_id)
);
CREATE TABLE IF NOT EXISTS mission_claims (
  user_id TEXT NOT NULL,
  period TEXT NOT NULL,
  mission_id TEXT NOT NULL,
  xp INTEGER DEFAULT 0,
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, period, mission_id)
);
