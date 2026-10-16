# DESIGN.md — Design System Book Kartu Animein (diadaptasi dari Brainfish)

Dokumen ini dirangkum dari screenshot halaman utama (home) Brainfish. Nilai warna diambil langsung dari piksel gambar; ukuran, radius, dan font adalah estimasi visual, jadi sesuaikan jika ada akses ke kode aslinya.

---

## 1. Karakter Visual

**Kata kunci:** playful, ramah, "underwater", neo-brutalist ringan, bersih.

- Tema narasi: halaman bergerak dari **langit → laut dangkal → laut dalam → dasar laut**, seiring scroll. Latar belakang berupa gradien vertikal panjang, bukan blok warna datar.
- Elemen UI berkesan "stiker": outline hitam tipis, bayangan keras (tanpa blur) di kanan-bawah, sudut membulat.
- Ilustrasi kecil (awan, ikan, karang, rumput laut) memberi kesan hidup, tetapi konten tetap berada di kartu putih yang rapi dan mudah dibaca.
- Nada tulisan: percaya diri, singkat, sedikit jenaka ("Not bolted on.", "Stop Reacting. Start Preventing.").

---

## 2. Warna

### 2.1 Brand & Aksen

| Token | Hex | Penggunaan |
|---|---|---|
| `--color-brand-lime` | `#A3E636` | Tombol utama, tab aktif, header kartu "Knowledge", indikator status, ikon ikan |
| `--color-ink` | `#0A0A0A` | Teks utama, outline, bayangan keras |
| `--color-white` | `#FFFFFF` | Kartu, tombol sekunder, navbar |
| `--color-cream` | `#FFFFF6` | Isi kartu diagram (sedikit hangat) |

### 2.2 Gradien Latar (atas ke bawah)

| Zona | Hex perkiraan | Keterangan |
|---|---|---|
| Langit atas | `#8CE4F0` | Hero, dengan awan putih beroutline |
| Langit bawah | `#B9F0F5` | Transisi ke bagian ombak |
| Mint | `#ABEBD1` → `#69D6B6` | Bagian "Support Isn't Broken" |
| Teal-biru | `#6BC4D2` → `#5B9CF0` | Transisi ke bagian fitur |
| Biru cerah | `#2C67E9` | Bagian "Fast & Flexible" |
| Biru dalam | `#2648B6` | Bagian studi kasus |
| Navy footer | `#173080` | Footer & logo besar |

Gunakan gradien linear vertikal yang halus antar zona, bukan garis batas tegas. Pengecualian: pemisah hero ke mint memakai **tepi bergelombang** (lihat bagian 6).

### 2.3 Warna Pastel Kategori (chip & kartu fitur)

Dipakai sebagai latar chip kecil dan kartu fitur supaya tiap kategori mudah dibedakan.

| Token | Hex | Contoh pemakaian |
|---|---|---|
| `--pastel-pink` | `#F7EAFC` | "Your Product" |
| `--pastel-yellow` | `#FFFAEA` | "Videos" |
| `--pastel-green` | `#D7F2E3` | "Help Center", "AI Help Center" |
| `--pastel-lime` | `#FBFFEA` | "Knowledge Bases", "AI Knowledge Hub" |
| `--pastel-blue` | `#DBEAFD` | "Drives", "AI Channels" |
| `--pastel-orange` | `#FFEDD7` | "AI In-App" |
| `--pastel-purple` | `#E9E3FB` | "AI Enablement" |
| `--pastel-red` | `#FFE4E8` | "API Specs", chip masalah (✕) |
| `--card-purple-lg` | `#F5D4FA` | Kartu besar "Connect Brainfish to Any Tool" |
| `--card-blue-lg` | `#C2DCFF` | Kartu besar "Install in Minutes" |

Setiap chip pastel punya **outline tipis dengan warna lebih gelap dari tint-nya** (mis. chip biru berborder biru sedang), bukan hitam. Hitam dipakai untuk elemen interaktif utama.

### 2.4 Warna Semantik

| Peran | Warna |
|---|---|
| Masalah / negatif | Latar `#FFE4E8`, ikon ✕ merah `#E5484D`, teks hitam |
| Sukses / status | Titik hijau lime `#A3E636` (mis. "All systems operational") |
| Kode | Teks biru-ungu pada latar putih, nomor baris abu-abu |

---

## 3. Tipografi

**Keluarga font:** sans-serif geometris modern (kesan mirip Satoshi / Figtree / Plus Jakarta Sans). Sediakan fallback: `system-ui, -apple-system, "Segoe UI", sans-serif`.

| Peran | Ukuran (desktop) | Berat | Catatan |
|---|---|---|---|
| Display / H1 hero | 44–56px | 500 | Rata tengah, 2 baris, line-height ±1.1 |
| H2 section | 32–40px | 500–600 | Rata tengah atau kiri, line-height ±1.15 |
| H3 kartu | 22–28px | 500 | Judul kartu fitur besar |
| Subjudul tebal | 16–18px | 600–700 | Mis. "Traditional support software isn't working." |
| Body | 15–16px | 400 | Warna ink, line-height ±1.5 |
| Body kecil | 13–14px | 400 | Deskripsi kartu |
| Label chip / tombol | 13–14px | 500 | Tombol memakai berat sedang |
| Angka metrik | 32–40px | 500 | "+20%", "+275%", "37%", "92%" |
| Kode | 12–13px | 400 | Monospace, di dalam kotak putih |

Aturan: judul besar pakai kapitalisasi judul ("Full-Stack AI Agents for Self-Service"); label kecil dan chip pakai kapitalisasi kalimat.

---

## 4. Bentuk, Outline, dan Bayangan

Ini ciri paling khas dari desain ini.

| Properti | Nilai |
|---|---|
| Outline | `1.5px solid #0A0A0A` pada tombol, navbar, kartu putih, kartu testimoni |
| Bayangan keras (tombol & kartu) | `box-shadow: 3px 3px 0 #0A0A0A` (tanpa blur) |
| Bayangan keras (kartu besar putih) | `box-shadow: 5px 6px 0 #0A0A0A` |
| Radius tombol | `8px` |
| Radius chip kecil | `6–8px` |
| Radius kartu | `12–16px` |
| Radius kartu besar | `20–24px` |
| Radius navbar | `999px` (pill) |
| Radius badge section | `999px` (pill) |

Kartu diagram di hero (Knowledge / Distribution) memakai **bayangan lembut** dan tanpa outline hitam tebal, sehingga terasa lebih ringan dibanding tombol dan kartu testimoni.

---

## 5. Komponen

### 5.1 Navbar
- Pill putih mengambang di atas hero, lebar ±85% konten, outline hitam + bayangan keras.
- Kiri: logo (ikon ikan lime + wordmark "Brainfish"). Tengah: menu (Why Brainfish, Product ▾, Solutions ▾, Resources ▾, Pricing). Kanan: toggle bendera/bahasa kecil, tombol **Sign in** (putih), tombol **Book Demo** (lime, ikon kalender).

### 5.2 Tombol
| Varian | Latar | Teks | Outline | Bayangan |
|---|---|---|---|---|
| Primary | `#A3E636` | ink | 1.5px ink | `3px 3px 0 ink` |
| Secondary | `#FFFFFF` | ink | 1.5px ink | `3px 3px 0 ink` |

- Tinggi ±36–40px, padding horizontal ±16px, ikon 16px di kiri teks (kalender, panah-keluar, integrasi).
- Hover: geser tombol `2px 2px` ke arah bayangan dan kurangi bayangan jadi `1px` (efek "ditekan").

### 5.3 Badge Section (pill)
- Putih, outline tipis ink, ikon kecil berwarna (ikan atau percikan ✦) di kiri, teks 12–13px.
- Muncul di atas hampir setiap judul section ("Your product's resident expert", "Introducing Brainfish", "Integrated & Secure").

### 5.4 Chip Kategori
- Latar pastel, outline tipis sewarna, ikon outline di kiri, teks 13px berat 500, tinggi ±26–30px, radius 6px.
- Di dalam kartu diagram, chip disusun vertikal dengan jarak 8px dan dikelompokkan dengan label grup kecil ("Generation", "Curation", "Customers", "Internal").

### 5.5 Kartu Diagram (Hero)
- Dua kartu sejajar: **Knowledge** dan **Distribution**, dihubungkan panah putus-putus ke ikon tengah "Brainfish AI Agents" (bintang bergerigi lime berisi ikan putih).
- Header kartu lime dengan ikon dan judul 20–22px; badan kartu krem/biru muda sangat pucat.

### 5.6 Kartu Masalah (✕)
- Chip merah muda dengan ikon ✕ merah, outline merah tua tipis.
- **Dirotasi acak** antara −4° sampai +4° dan ditebar tidak beraturan untuk kesan tempelan.

### 5.7 Kartu Testimoni + Metrik
- Kartu putih, outline ink, **dirotasi** (kiri ≈ −5°, kanan ≈ +6°).
- Isi: logo klien, kutipan tebal, foto avatar bulat + nama + jabatan, dua kotak metrik, tombol "Read Case Study".
- Kotak metrik: gradien lime muda → lime, outline ink, angka besar + label kecil tebal.

### 5.8 Tab
- Tiga tab ("1: Knowledge", "2: Distribution", "3: Insights"). Aktif = lime + outline ink + bayangan; tidak aktif = putih, teks abu.

### 5.9 Kartu Fitur Besar
- Kartu putih lebar penuh dengan bayangan keras tebal. Dua kolom: ilustrasi atau mockup di kiri/kanan, teks + daftar poin + tombol di sisi lain.
- Kartu terpisah "Fast & Flexible" memakai latar pastel penuh (ungu muda, biru muda, kuning, dst.) dengan ilustrasi ubin logo yang dirotasi.

### 5.10 Ubin Logo Integrasi
- Persegi putih radius 12px, outline ink, berisi logo (Notion, Shopify, HubSpot, Salesforce, Magento, Zendesk, Intercom, dll.), dirotasi sedikit dan bertumpuk.

### 5.11 Blok Kode
- Kotak putih, radius 8px, outline abu tipis, nomor baris di gutter kiri, ikon salin di pojok kanan atas.

### 5.12 Strip Logo Klien
- Baris logo monokrom hitam (madpaws, Buffer, Relevance AI, wati, Circular, 13cabs, Smokeball) yang bergulir horizontal tanpa henti (marquee), di atas latar mint.

### 5.13 Kartu Studi Kasus
- Kartu dengan gambar/ilustrasi atas, judul, dan sorotan hasil. Grid tidak simetris: satu kartu besar di kiri, dua kartu lebih kecil bertumpuk di kanan.

### 5.14 CTA Akhir
- Kartu putih besar bertuliskan "Interested? Schedule your demo today." dengan mockup jendela form booking di sisi kanan, dikelilingi karang dan rumput laut.

### 5.15 Footer
- Latar navy `#173080`. Kolom tautan (Product, Solutions, Resources) di kiri dalam kotak putih berisi daftar tautan; formulir berlangganan di kanan.
- Baris bawah: badge **All systems operational** (putih, titik lime), hak cipta tengah + tautan Terms/Privacy/Cookies/Trust Center, ikon sosial (X, LinkedIn) dalam kotak putih berbayangan keras.
- Wordmark "Brainfish" **raksasa** berwarna putih dengan ikon ikan lime di dasar halaman.

---

## 6. Ilustrasi & Dekorasi

- **Awan:** putih, outline hitam tipis, bentuk bulat sederhana, tersebar di hero.
- **Ombak:** tepi bergelombang (SVG) memisahkan hero (langit) dari bagian mint.
- **Ikan kecil lime:** ikan-ikan mungil dengan outline hitam berenang di antara bagian; ukuran bervariasi.
- **Karang & rumput laut:** muncul di bagian bawah (biru dalam), warna oranye, merah muda, ungu, hijau tua dengan siluet gelap.
- **Maskot / bentuk khas:** bintang bergerigi lime dengan tiga ikan putih di dalamnya.
- **Gaya ikon:** garis (outline) 1.5px, sudut membulat, ukuran 16–20px.
- Semua ilustrasi dekoratif harus `aria-hidden="true"`.

---

## 7. Layout & Spasi

| Properti | Nilai |
|---|---|
| Lebar konten maks | ±1200px (konten teks sempit ±640–760px) |
| Padding horizontal halaman | 24px (mobile) / 48px+ (desktop) |
| Jarak antar section | 96–140px |
| Jarak badge → judul | 16px |
| Jarak judul → paragraf | 16–20px |
| Jarak paragraf → tombol | 24–32px |
| Grid kartu | 2 kolom, gap 24px |
| Skala spasi dasar | 4px (4, 8, 12, 16, 24, 32, 48, 64, 96) |

- Hero: semua rata tengah. Section masalah: teks kiri + kartu masalah berserakan kanan. Section fitur: kartu lebar penuh bertumpuk.
- Responsif: kolom ganda menjadi satu kolom di bawah ±768px, navbar berubah menjadi menu hamburger, rotasi kartu dikurangi.

---

## 8. Gerak (Motion)

Tidak terlihat di screenshot, tetapi disarankan agar konsisten dengan nuansa playful:

- Awan dan ikan melayang pelan (translate X/Y 6–12px, 6–10 dtk, loop).
- Kartu miring: saat hover, rotasi menuju 0° dan naik 4px.
- Tombol: efek "ditekan" 120ms ease-out.
- Marquee logo klien: linear, 30–40 dtk per putaran, berhenti saat hover.
- Hormati `prefers-reduced-motion`: matikan animasi dekoratif.

---

## 9. Aksesibilitas

- Teks ink `#0A0A0A` di atas lime `#A3E636` memiliki kontras tinggi (>10:1), aman untuk tombol.
- Teks putih di atas biru `#2C67E9` ±5:1, cukup untuk teks besar; untuk teks kecil gunakan biru lebih gelap (`#2648B6`).
- Jangan mengandalkan warna saja pada chip kategori: selalu sertakan ikon dan label.
- Fokus keyboard: `outline: 3px solid #0A0A0A; outline-offset: 2px` agar terlihat di semua latar.
- Teks alternatif untuk logo klien dan avatar; ilustrasi dekoratif disembunyikan dari screen reader.

---

## 10. Contoh Design Tokens (CSS)

```css
:root {
  /* Warna */
  --ink: #0a0a0a;
  --white: #ffffff;
  --cream: #fffff6;
  --lime: #a3e636;

  --sky-top: #8ce4f0;
  --sky-bottom: #b9f0f5;
  --mint: #abebd1;
  --blue-bright: #2c67e9;
  --blue-deep: #2648b6;
  --navy: #173080;

  --pastel-pink: #f7eafc;
  --pastel-yellow: #fffaea;
  --pastel-green: #d7f2e3;
  --pastel-lime: #fbffea;
  --pastel-blue: #dbeafd;
  --pastel-orange: #ffedd7;
  --pastel-purple: #e9e3fb;
  --pastel-red: #ffe4e8;

  /* Tipografi */
  --font-sans: "Satoshi", "Figtree", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, monospace;

  /* Bentuk */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 16px;
  --radius-xl: 24px;
  --radius-pill: 999px;
  --border: 1.5px solid var(--ink);
  --shadow-hard: 3px 3px 0 var(--ink);
  --shadow-hard-lg: 5px 6px 0 var(--ink);
}

.btn {
  font: 500 14px/1 var(--font-sans);
  padding: 11px 16px;
  border: var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-hard);
  transition: transform 120ms ease-out, box-shadow 120ms ease-out;
}
.btn:hover { transform: translate(2px, 2px); box-shadow: 1px 1px 0 var(--ink); }
.btn--primary   { background: var(--lime); color: var(--ink); }
.btn--secondary { background: var(--white); color: var(--ink); }

.badge {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  background: var(--white);
  border: 1px solid var(--ink);
  border-radius: var(--radius-pill);
  font: 500 13px/1 var(--font-sans);
}

.page-gradient {
  background: linear-gradient(
    to bottom,
    var(--sky-top) 0%,
    var(--sky-bottom) 12%,
    var(--mint) 22%,
    #5b9cf0 45%,
    var(--blue-bright) 62%,
    var(--blue-deep) 85%,
    var(--navy) 100%
  );
}
```

---

## 11. Catatan & Asumsi

- Screenshot adalah halaman penuh yang sangat panjang (3840 × 23306 px), jadi nilai ukuran piksel di atas diperkirakan dari proporsi tampilan, bukan diukur dari CSS aslinya.
- Nama font asli tidak terlihat dari gambar; pilihan di atas hanya padanan terdekat secara visual.
- Beberapa bagian bawah halaman (studi kasus, CTA) sempat dilihat dalam bentuk ringkasan; detail kecil seperti teks kartu bisa berbeda dari versi live.
