# Book Kartu Animein

Galeri book 200 kartu Animein. Login tanpa password: tekan **Dapatkan Kode**
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

## Deploy Vercel

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
| `GET /api/cards` | Pool kartu + flag `owned` per user login |
| `POST+GET+DELETE /api/trade/create` | Buat / lihat / batalkan kode trade angka |
| `GET+POST /api/trade/offer` | Intip penawaran / konfirmasi tukar |
| `GET /api/trade/users` | Daftar user + jumlah kartu |
| `POST /api/battle/ai` | (dihapus, diganti room interaktif) |
| `POST+GET /api/battle/room` | Buat room / polling state (kode angka) |
| `POST /api/battle/room/join` | Gabung room PvP |
| `POST /api/battle/room/act` | 1 aksi giliran (validasi server) |

## Battle kartu (vs AI + PvP)

Halaman `/battle` (sidebar): pilih 3 kartumu **berurutan** (posisi 1 = aktif)
→ lawan AI atau buat/gabung room PvP via **kode 6 angka**.

- **Arena interaktif**: tiap giliran pilih ATK biasa / Skill (bayar cons) /
  Ganti kartu. Cons milik tim (maks 10): ATK +1, tiap assist +1/giliran
  (maks +2). Tanpa cons hanya bisa ATK biasa. Support heal 1 kartu tim.
- **Animasi**: kartu menyerang maju, target bergoyang, angka damage melayang,
  heal bersinar, KO jadi abu-abu, badge status (BURN/SHD/STUN/WEAK/FOKUS).
- PvP: giliran bergantian, polling 2,5 detik, **timeout 60 detik** otomatis
  ATK bila AFK. Semua aksi divalidasi server (anti-cheat).
- Menang +100 XP, kalah +20 XP (maks 10 battle ber-XP/hari).
- Kartu milik sendiri di book bisa diketuk untuk flip dan melihat statnya.

## Trade kartu

Halaman `/trade` (sidebar): dropdown 2 pilihan — **Buat kode** (pilih
kartumu → dapat kode 6 angka, 30 menit, sekali pakai) dan **Masukkan kode**
(input khusus angka, keypad numerik di HP → intip penawaran → pilih kartumu
sebagai gantinya → konfirmasi). Tukar dieksekusi atomik; ditolak bila salah
satu pihak sudah punya kartu yang akan diterima, atau kartunya sama.

## Battle kartu (vs AI)

Halaman `/battle` (sidebar): pilih 3 kartumu → simulasi berjalan di server
(otoritatif, anti-cheat) → playback animasi HP bar, cons, dan log per giliran
(Jeda, Cepat 2x, Lewati).

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
