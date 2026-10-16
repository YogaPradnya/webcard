-- Idempotency keys untuk POST mutasi (gacha/pull, missions/claim,
-- shop/order, trade/create, trade/offer). Cegah eksekusi ganda saat
-- klien retry / double-click: key yang sama mengembalikan hasil tersimpan.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  route TEXT NOT NULL,
  status INTEGER NOT NULL,
  response TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (key, user_id, route)
);
CREATE INDEX IF NOT EXISTS idx_idem_user_created ON idempotency_keys (user_id, created_at DESC);
