// Service worker minimal: cache-first untuk aset statis, network-first untuk halaman/API.
const CACHE = 'animein-cards-v1';
const STATIC_PATTERNS = ['/titles/', '/battle-waiting.png', '/favicon.ico', '/icon-', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // API selalu network
  const isStatic = STATIC_PATTERNS.some((p) => url.pathname.includes(p)) || url.pathname.startsWith('/_next/static/');
  if (!isStatic) return; // halaman: network (tetap fresh)
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) cache.put(request, res.clone());
            return res;
          }),
      ),
    ),
  );
});
