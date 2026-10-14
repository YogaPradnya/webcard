-- 004: tabel milik WEB untuk shop (order Midtrans + slot kartu custom).
CREATE TABLE IF NOT EXISTS shop_orders (
  order_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  qty INTEGER DEFAULT 1,
  amount_idr INTEGER NOT NULL,
  xp_amount INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  snap_token TEXT DEFAULT NULL,
  paid_at INTEGER DEFAULT 0,
  payment_type TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shop_orders_user ON shop_orders (user_id, created_at DESC);
ALTER TABLE shop_orders ADD COLUMN paid_at INTEGER DEFAULT 0;
ALTER TABLE shop_orders ADD COLUMN payment_type TEXT DEFAULT '';
CREATE TABLE IF NOT EXISTS user_display_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT 'Kartu Custom',
  image_url TEXT DEFAULT NULL,
  border_type TEXT NOT NULL DEFAULT 'classic',
  border_color TEXT NOT NULL DEFAULT '',
  edits_used INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_display_slots_user ON user_display_slots (user_id);
ALTER TABLE user_display_slots ADD COLUMN description TEXT DEFAULT '';
