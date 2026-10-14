-- 008: kolom milik WEB di atas tabel milik BOT (aditif saja, tanpa CREATE).
-- user_cards & user_stats dibuat/dimiliki bot; web hanya menambah kolom.
ALTER TABLE user_cards ADD COLUMN quantity INTEGER DEFAULT 1;
UPDATE user_cards SET quantity = 1 WHERE quantity IS NULL OR quantity < 1;
ALTER TABLE user_stats ADD COLUMN web_title TEXT DEFAULT NULL;
