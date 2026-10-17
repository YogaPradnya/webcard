-- 011: migrasi shop dari Midtrans (Snap) ke PayDisini (QRIS).
-- Kolom baru menyimpan data transaksi PayDisini per order
-- (qr_content = payload QRIS mentah, qr_url = gambar QR dari PayDisini).
ALTER TABLE shop_orders ADD COLUMN pay_id TEXT DEFAULT '';
ALTER TABLE shop_orders ADD COLUMN qr_url TEXT DEFAULT '';
ALTER TABLE shop_orders ADD COLUMN qr_content TEXT DEFAULT '';
ALTER TABLE shop_orders ADD COLUMN checkout_url TEXT DEFAULT '';
ALTER TABLE shop_orders ADD COLUMN pay_channel TEXT DEFAULT '';
