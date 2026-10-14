-- 002: tabel milik WEB untuk trade antar user.
-- Kolom amount ditambah via ALTER agar DB lama ikut maju (runner abaikan
-- error "duplicate column" bila kolom sudah ada).
CREATE TABLE IF NOT EXISTS trade_offers (
  code TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_username TEXT NOT NULL DEFAULT '',
  char_name TEXT NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'Common',
  expires_at INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_trade_owner ON trade_offers (owner_id);
CREATE INDEX IF NOT EXISTS idx_trade_expires ON trade_offers (expires_at);
CREATE INDEX IF NOT EXISTS idx_trade_search ON trade_offers (owner_username, char_name, code);
ALTER TABLE trade_offers ADD COLUMN amount INTEGER DEFAULT 1;
UPDATE trade_offers SET amount = 1 WHERE amount IS NULL OR amount < 1;
