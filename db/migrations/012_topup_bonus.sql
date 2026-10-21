-- 012: Bonus Top-Up Bulanan (menggantikan bonus otomatis per paket).
-- Progres dihitung dari SUM(amount_idr) order kind='xp' status='paid' per bulan WIB;
-- klaim disimpan per (user, periode, milestone) agar double-click aman.
CREATE TABLE IF NOT EXISTS topup_bonus_claims (
  user_id TEXT NOT NULL,
  period TEXT NOT NULL,
  milestone_id TEXT NOT NULL,
  amount_idr INTEGER NOT NULL DEFAULT 0,
  cards_json TEXT NOT NULL DEFAULT '[]',
  claimed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, period, milestone_id)
);

CREATE INDEX IF NOT EXISTS idx_topup_claims_user ON topup_bonus_claims (user_id, period);

-- Dukung query total top-up bulanan per user (WHERE user_id + status + rentang paid_at).
CREATE INDEX IF NOT EXISTS idx_shop_orders_user_paid ON shop_orders (user_id, status, paid_at);
