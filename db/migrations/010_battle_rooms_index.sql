-- 010: index untuk pencarian room aktif per user (/api/battle/mine, /api/battle/bootstrap).
-- Insiden 17 Okt: query `(p1_id = ? OR p2_id = ?) AND status IN (...)` jadi
-- SCAN battle_rooms karena p2_id tidak terindeks. Tabel membengkak (824 room
-- finished numpuk, ~5MB JSON state) sementara query ini jalan tiap 30 dtk per
-- tab (poll Sidebar) -> Turso jenuh, p95 8-10 dtk, timeout 15 dtk -> 503.
-- Composite (id, status) supaya filter status ikut ter-index (bukan fetch dulu).
CREATE INDEX IF NOT EXISTS idx_battle_p1_status ON battle_rooms (p1_id, status);
CREATE INDEX IF NOT EXISTS idx_battle_p2_status ON battle_rooms (p2_id, status);
-- Pendukung cleanup retensi (finished/ongoing basi) supaya tabel tidak tumbuh
-- selamanya; DELETE bisa langsung pakai range status + updated_at.
CREATE INDEX IF NOT EXISTS idx_battle_status_updated ON battle_rooms (status, updated_at);
-- Redundan: prefix idx_battle_p1_status sudah mencakup seluruh idx_battle_p1.
DROP INDEX IF EXISTS idx_battle_p1;
