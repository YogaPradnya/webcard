# Kepemilikan Skema DB (bot vs web)

DB Turso dipakai berdua. Aturan main agar tidak tabrakan:

## Milik BOT (dibuat & dimigrasi bot, web JANGAN create table)
- `user_stats`, `user_cards`, `card_battle_stats`, `settings`, `quiz_*`, `chat_logs`

## Milik WEB (dibuat & dimigrasi web via `db/migrations/`)
- `battle_rooms`, `battle_leaderboard`, `battle_history`, `battle_daily`
- `trade_offers`
- `user_card_pity`, `web_gacha_history`
- `shop_orders`, `user_display_slots`
- `user_display_cards`
- `mission_progress`, `mission_claims`
- `web_login_codes`, `user_profile_prefs`, `web_rate_limits`, `web_rate_counts`
- `schema_version` (dicatat runner migrasi)

## Pengecualian: kolom web di tabel bot (aditif saja)
- `user_cards.quantity`, `user_stats.web_title` (lihat `008_web_columns.sql`).
- Boleh tambah kolom NULL/DEFAULT, JANGAN ubah/hapus kolom bot.

## Aturan migrasi
1. Skema berubah HANYA lewat file baru `db/migrations/NNN_nama.sql` (nomor naik, jangan edit file yang sudah ter-apply di produksi).
2. Tiap deploy: `npm run migrate` (lihat README Deploy VPS). Server juga auto-migrasi saat boot via `src/instrumentation.js` sebagai jaring pengaman.
3. Request path DILARANG DDL: semua `ensure*` di `src/lib/` wajib return dini bila `isSchemaReady()` (lihat `src/lib/schema.js`). DDL di situ hanya fallback darurat bila migrasi belum jalan — kegagalan migrasi tercatat loud di log boot, situs tetap hidup (fail-safe, bukan fail-fast).
