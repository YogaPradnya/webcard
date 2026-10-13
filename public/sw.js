// Service worker ini SENGAJA menonaktifkan diri sendiri.
// Versi sebelumnya (cache-first chunk JS) pernah menyajikan kode basi selamanya
// di browser yang sempat mendaftarkannya — file ini memastikan SW lama itu
// ter-unregister sekali, lalu tidak ada SW lagi yang berjalan.
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      try {
        await self.registration.unregister();
      } catch {
        // abaikan
      }
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        await self.registration.unregister();
      } catch {
        // abaikan
      }
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      try {
        await self.clients.claim();
      } catch {
        // abaikan
      }
    })(),
  );
});

// Tidak ada handler fetch: semua request langsung ke network.
