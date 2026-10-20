# KartuYogaa — Book Kartu Anime

Galeri book 265 kartu anime (gacha/trade/battle PvP, shop, misi). Login tanpa password: tekan **Dapatkan Kode**
di web, ketik `.login KODE` di chat Animein dari akunmu, web langsung masuk.
ID yang dipakai identik dengan `user_id` di database bot, jadi status kartu
milik/belum otomatis nyambung dengan hasil `.gacha` di chat.

- Kartu yang **sudah punya**: tampil jelas + `★level`, power, badge Pajangan.
- Kartu yang **belum punya**: gambar abu-abu, nama tetap tampil.

Tanpa password, tanpa request ke API Animein — bebas blokir Cloudflare.

## Env terpisah

Env web ini terpisah dari `.env` bot. Salin contoh lalu isi:

```bash
cp .env.example .env.local
```

Isi yang wajib:

| Key | Keterangan |
| --- | --- |
| `TURSO_URL` | URL Turso yang **sama** dengan bot |
| `TURSO_AUTH_TOKEN` | Token Turso yang **sama** dengan bot |
| `SESSION_SECRET` | String acak min 16 karakter (penyegel cookie) |

## Jalan lokal

```bash
npm install
npm run dev
```

Buka http://localhost:3000 → otomatis ke `/book` → diminta kode `.pair`.

> Bot juga butuh `CARDS_WEB_URL` di `.env` bot (URL publik web ini) agar
> balasan `.pair` menyertakan link web. Contoh lokal: `http://localhost:3000`.

## Deploy VPS (produksi saat ini: kartu.yogaa.web.id)

> Bagian Vercel di bawah sudah tidak akurat — yang live adalah VPS
> self-hosted (`next start`). Jangan hapus bagian Vercel (arsip).

```bash
git pull
npm install        # atau npm ci
npm run migrate    # wajib: terapkan db/migrations/*.sql (idempoten)
npm run build
pm2 restart kartu  # sesuaikan nama proses / systemctl
```

Server juga auto-migrasi saat boot (`src/instrumentation.js`) sebagai jaring
pengaman bila langkah `migrate` terlewat. Aturan skema:
`db/SCHEMA_OWNERSHIP.md` — skema berubah hanya lewat file migrasi baru,
request path dilarang DDL.

## Deploy Vercel (arsip, tidak dipakai produksi)

1. Push folder ini (repo sudah termasuk `web-cards/`).
2. Di Vercel: Add New Project → pilih repo → **Root Directory = `web-cards`**.
3. Isi Environment Variables: `TURSO_URL`, `TURSO_AUTH_TOKEN`,
   `SESSION_SECRET` (pakai string acak panjang).
4. Deploy. Tidak perlu setting build khusus (default Next.js).

## API internal

| Route | Fungsi |
| --- | --- |
| `POST /api/auth/code` | Buat kode login 6 huruf |
| `GET /api/auth/code/status` | Polling status klaim (buat sesi) |
| `POST /api/auth/logout` | Hapus cookie sesi |
| `GET /api/auth/me` | Username otomatis dari sesi (database bot) |
| `GET /api/cards` | Pool kartu + flag `owned` + `quantity` per user login |
| `POST /api/cards/showcase` | Atur pajangan (+ backfill `image_url` untuk bot) |
| `POST /api/cards/evolve` | Evolusi: 3 stack → ★+1 (maks 5) |
| `GET /api/gacha` | Info cost/rate/stok/XP/riwayat gacha web |
| `POST /api/gacha/pull` | Gacha 1x/10x (tanpa limit harian) |
| `POST /api/convert` | Konversi copy kartu menjadi XP |
| `GET /api/profile` | Ringkasan profil + gelar web |
| `POST+GET+DELETE /api/trade/create` | Buat / lihat / batalkan kode trade angka |
| `GET+POST /api/trade/offer` | Intip penawaran / konfirmasi tukar |
| `GET /api/trade/users` | Daftar user + jumlah kartu |
| `POST /api/battle/ai` | (dihapus, diganti room interaktif) |
| `POST /api/battle/room` | Buat room (kode angka, difficulty AI) |
| `GET /api/battle/room` | Polling state (+ countdown forfeit) |
| `DELETE /api/battle/room` | Batalkan room waiting |
| `POST /api/battle/room/join` | Gabung room PvP (batas tebak 20x/mnt) |
| `POST /api/battle/room/act` | 1 aksi giliran (validasi server) |
| `POST /api/battle/room/forfeit` | Menyerah manual (akhiri game) |
| `GET /api/battle/history` | 10 riwayat battle milik sendiri |
| `GET /api/battle/rooms` | List room PvP waiting (10/hal) |
| `GET /api/battle/mine` | Room aktif milik sendiri (auto-restore) |
| `GET /api/battle/leaderboard?tab=` | Klasemen pvp/kolektor/xp |

## Battle kartu (vs AI + PvP interaktif)

Halaman `/battle`: pilih 3 kartumu **berurutan** (posisi 1 = aktif) dengan
filter cari/role/tier + preset tim tersimpan (5 slot, localStorage) + difficulty
AI (Easy/Normal/Hard) → lawan AI atau buat/gabung room PvP via **kode 6 angka**.

- **Arena interaktif**: tiap giliran pilih ATK biasa / Skill (bayar cons) /
  Ganti kartu. Cons milik tim (maks 10): ATK +1, tiap assist +1/giliran
  (maks +2). Tanpa cons hanya bisa ATK biasa. Support heal 1 kartu tim.
- **Menunggu lawan**: ilustrasi logo + kode room + animasi pulse, tombol
  Cek Lagi/Batal (hangus 5 menit).
- **Timer forfeit 2 menit**: countdown terlihat. Diam 2 menit = otomatis
  menyerah, game berakhir. Tombol Menyerah manual tersedia.
- **Animasi**: kartu menyerang maju, target bergoyang, angka damage melayang,
  heal bersinar, KO jadi abu-abu, badge status (BURN/SHD/STUN/WEAK/FOKUS).
- PvP: giliran bergantian, polling adaptif (pause saat tab hidden), semua aksi
  divalidasi server (anti-cheat). Tebak kode dibatasi 20x/menit.
- Menang +100 XP, kalah +20 XP (maks 10 battle ber-XP/hari, PvP saja).
- Riwayat 10 battle terakhir + leaderboard 3 tab (PvP/Kolektor/XP).

## Gacha web (menu Profil → Gacha)

Halaman `/gacha`: pilihan **1x** (cost normal) dan **10x** (bayar 9x, hemat 10%).
Rate, stok global, dan cost ikut `settings` yang sama dengan bot/dashboard.
**Tanpa limit harian** (limit hanya di bot), `total_pulls` tetap dicatat.

- Legend & Mythic unik per user (duplikat dialihkan/downgrade seperti bot);
  Epic/Rare/Common menumpuk via `quantity`.
- Reveal 1-1: warna tier dulu → kartu berputar → kartu muncul (badge BARU /
  +1 stack), tombol **Skip** membuka semua sekaligus.
- Menampilkan rate, stok tersisa (M/L/E), XP, dan 10 pull terakhir.

## Evolusi, Trade tumpuk, Konversi

- **Evolusi**: tiap kartu dengan `quantity >= 3` (di Book) bisa Evolusi:
  2 copy dipakai → ★+1 (maks 5), power+10. Legend/Mythic tidak bisa evolusi.
- **Trade**: penawaran dan pemberian mendukung **pilih jumlah copy** (stepper
  +/-); hasil menumpuk otomatis di kedua pihak, tanpa XP/Limit Break.
- **Konversi** (`/convert`, menu Profil): pilih kartu + jumlah per stack
  (stepper +/-) → konfirmasi → jadi XP (rate tabel bot:
  C50/R150/E400/L1000/M2500 per copy). Copy terakhir ikut bisa dikonversi
  dengan peringatan eksplisit.

## Book, Chat, Leaderboard

- **Book**: pagination 24/hal, sort (Tier/Nama/Power/Level), filter anime,
  skeleton loading, retry error, atur Pajangan langsung dari web
  (`POST /api/cards/showcase`). Saat dipajang, `image_url` yang kosong
  di-backfill dari art web agar kartu muncul di `.profil` bot.
- **Profil**: gelar web (Mythic + tier lengkap) hanya tampil di web,
  tersimpan di `user_stats.web_title` — `custom_title` (gelar costume bot)
  tidak tersentuh sehingga `.profil` bot tidak berubah.
- **Chat**: online 5 menit terakhir, reply tahan-lama, gelar + ikon terpasang,
  polling hemat (pause saat hidden), retry.
- **Login**: tombol Salin `.login KODE` (tanpa QR sesuai permintaan).

- Stat tiap kartu: HP, ATK biasa, Skill (damage + cons), Role
  (Damage/Tank/Support/Assist). Sama di semua user, beda tiap kartu.
- Tiap skill punya **efek khusus yang beragam**: Heavy, Crit, Burn (DoT),
  Double, Shield, Stun (Slam), Heal, Regen (HoT), Energize (Heal+Cons),
  Surge, Weaken, Fokus — plus **kombo chain** (+25% bila skill dipakai
  beruntun oleh tim yang sama).
- Cons milik tim (maks 10): ATK +1, tiap assist di tim +1/giliran (maks +2).
  Tanpa cons hanya bisa ATK biasa. Support heal 1 kartu tim, bukan damage.
- Menang +100 XP, kalah +20 XP (maks 10 battle ber-XP/hari, angka bisa diubah
  dari dashboard bot menu Web Kartu), level dihitung ulang dengan rumus bot.
  Data: `card_battle_stats` (seed: `npm run seed:battle`).
- Kartu milik sendiri di book bisa diketuk untuk flip dan melihat statnya.
