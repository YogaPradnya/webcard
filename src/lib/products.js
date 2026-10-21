// Katalog produk publik KartuYogaa.
// Sumber tunggal untuk landing page, Shop, dan API katalog agar harga/isi
// produk tidak berbeda antar halaman.
export const XP_PACKS = [
  { id: 'xp-5k', priceIdr: 5000, xp: 6000 },
  { id: 'xp-10k', priceIdr: 10000, xp: 11500 },
  { id: 'xp-50k', priceIdr: 50000, xp: 55000, bonusCards: { Epic: 1 } },
  { id: 'xp-100k', priceIdr: 100000, xp: 125000, bonusCards: { Legendary: 1 } },
  { id: 'xp-500k', priceIdr: 500000, xp: 650000, bonusCards: { Mythic: 1, Legendary: 2 } },
];

export const SLOT_PRICE_IDR = 10000;
export const MAX_SLOTS_PER_USER = 50;
export const MAX_EDITS_PER_SLOT = 3;

export const PRODUCT_NOTES = [
  'Semua produk bersifat digital. Tidak ada barang fisik dan tidak ada pengiriman fisik.',
  'Pembayaran diproses melalui Tripay dengan metode QRIS. Biaya layanan, bila ada, ditampilkan pada halaman pembayaran.',
  'Top-Up XP dikirim otomatis setelah pembayaran berstatus sukses.',
  'Bonus kartu Top-Up: Rp50.000 = 1 Epic; Rp100.000 = 1 Legendary; Rp500.000 = 1 Mythic + 2 Legendary. Bonus mengikuti stok; bila stok tier habis, sistem memberikan tier di bawahnya.',
  'Kartu Pajangan Custom diproses maksimal 3x24 jam setelah pembayaran terverifikasi.',
];
