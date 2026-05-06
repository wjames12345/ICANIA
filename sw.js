// Icania — service worker
// Strategy:
//   - Pre-cache the shell on install
//   - Network-first for HTML/navigation (so deploys are picked up; offline falls back to cached /)
//   - Cache-first for static assets (icons, fairy GIF, fonts)
// Cache name is versioned. Bump CACHE_VERSION when you change pre-cached assets.

const CACHE_VERSION = 'v9';
const CACHE = 'icania-' + CACHE_VERSION;

const PRECACHE = [
  '/',
  '/index.html',
  '/404.html',
  '/fairy_stopmotion.gif',
  '/favicon.png',
  '/favicon-32.png',
  '/favicon-192.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Navigation requests: network-first, fall back to cached / (the SPA shell).
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (resp && resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE).then((c) => c.put('/', clone)).catch(() => {});
            return resp;
          }
          // 404 from GitHub Pages on a deep path: fall through to cached shell
          return caches.match('/').then((r) => r || resp);
        })
        .catch(() => caches.match('/').then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Same-origin static assets: cache-first, update in background.
  if (sameOrigin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchAndCache = fetch(req)
          .then((resp) => {
            if (resp && resp.ok) {
              const clone = resp.clone();
              caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
            }
            return resp;
          })
          .catch(() => cached);
        return cached || fetchAndCache;
      })
    );
    return;
  }

  // Cross-origin (Google Fonts CSS + font files): cache-first as a nice-to-have.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
        }
        return resp;
      }).catch(() => cached))
    );
  }
});
