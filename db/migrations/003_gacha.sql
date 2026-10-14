-- 003: tabel milik WEB untuk gacha (pity + riwayat pull).
CREATE TABLE IF NOT EXISTS user_card_pity (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  pity_count INTEGER DEFAULT 0,
  total_pulls INTEGER DEFAULT 0,
  pulls_today INTEGER DEFAULT 0,
  today_key TEXT DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS web_gacha_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  char_name TEXT NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'Common',
  is_new INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gacha_hist_user ON web_gacha_history (user_id, id DESC);
