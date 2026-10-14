-- 005: tabel milik WEB untuk kartu pajangan (display-only).
CREATE TABLE IF NOT EXISTS user_display_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  grade TEXT NOT NULL DEFAULT '',
  border_type TEXT NOT NULL DEFAULT 'classic',
  border_color TEXT NOT NULL DEFAULT '',
  image_url TEXT DEFAULT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_showcase INTEGER DEFAULT 0,
  gifted_by TEXT NOT NULL DEFAULT 'admin',
  gifted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_display_name_unique ON user_display_cards (name);
CREATE INDEX IF NOT EXISTS idx_display_user ON user_display_cards (user_id);
ALTER TABLE user_display_cards ADD COLUMN edits_used INTEGER DEFAULT 0;
UPDATE user_display_cards SET edits_used = 0 WHERE edits_used IS NULL;
