// Service worker gambar: cache-first KHUSUS gambar Cloudinary.
// Pelajaran insiden SW lama: JANGAN PERNAH cache JS/_next/dokumen/API di sini —
// hanya gambar (URL stabil per kartu; art baru = URL baru = fetch segar otomatis).
// File ini no-store di next.config.js agar update-nya langsung menyebar.
const IMG_CACHE = 'animein-img-v1';
const MAX_IMG_ENTRIES = 200;

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== IMG_CACHE).map((k) => caches.delete(k)));
        await self.clients.claim();
      } catch {
        // abaikan
      }
    })(),
  );
});

function isCacheableImage(url) {
  return url.origin === 'https://res.cloudinary.com' && /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (!isCacheableImage(url)) return; // selain gambar Cloudinary: langsung network
  event.respondWith(
    (async () => {
      try {
        const cache = await caches.open(IMG_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res && res.ok) {
          try {
            await cache.put(request, res.clone());
            const keys = await cache.keys();
            if (keys.length > MAX_IMG_ENTRIES) await cache.delete(keys[0]);
          } catch {
            // kuota penuh: pakai respons network apa adanya
          }
        }
        return res;
      } catch (err) {
        try {
          const cache = await caches.open(IMG_CACHE);
          const hit = await cache.match(request);
          if (hit) return hit;
        } catch {
          // abaikan
        }
        throw err;
      }
    })(),
  );
});
