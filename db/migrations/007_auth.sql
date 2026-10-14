-- 007: tabel milik WEB untuk login pairing, preferensi profil, rate-limit.
CREATE TABLE IF NOT EXISTS web_login_codes (
  code TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  user_id TEXT DEFAULT NULL,
  username TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
ALTER TABLE web_login_codes ADD COLUMN tnc_at INTEGER DEFAULT 0;
CREATE TABLE IF NOT EXISTS user_profile_prefs (
  user_id TEXT PRIMARY KEY,
  showcase_source TEXT NOT NULL DEFAULT 'auto',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS web_rate_limits (
  key TEXT PRIMARY KEY,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS web_rate_counts (
  key TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_counts ON web_rate_counts (key, ts);
