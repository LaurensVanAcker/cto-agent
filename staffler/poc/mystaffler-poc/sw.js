/**
 * Tiny service worker for the MyStaffler-PoC.
 *
 *  - Pre-caches the static shell (index.html + manifest + icons + the
 *    main JS / CSS bundle) so the install-to-home-screen flow on iOS
 *    and Android shows the app icon and a content-filled splash on
 *    first launch.
 *  - Network-first for `/api/*` — auth + data should never be served
 *    from cache; falls back to a minimal JSON error if the network is
 *    unreachable so the UI's offline banner kicks in.
 *  - Stale-while-revalidate for everything else.
 *  - Bumps `VERSION` to bust the cache on every release. Operators
 *    can also hit Settings → Storage → Clear if a deploy hits a sw
 *    cache that won't budge.
 */
const VERSION = 'mystaffler-poc-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.svg',
  '/icon-512.svg',
  '/src/main.js',
  '/src/api.js',
  '/src/state.js',
  '/src/styles.css',
];

self.addEventListener('install', (event) => {
  // skipWaiting → the next page load uses the new SW immediately
  // (otherwise the user has to close every tab first, which is a
  // demo-killer).
  self.skipWaiting();
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL).catch(() => {})),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Take control of any open tabs so the new SW handles their
      // fetches without a manual refresh.
      self.clients.claim(),
      // Drop every cache that isn't the current VERSION.
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))),
      ),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Don't touch cross-origin: let the browser default handle it.
  if (url.origin !== self.location.origin) return;
  // Don't try to cache POST / PUT / DELETE — those mutate state.
  if (event.request.method !== 'GET') return;

  // /api/* — network-first. Caching auth/data would break the demo.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ kind: 'offline', message: 'Geen verbinding.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    return;
  }

  // Everything else — stale-while-revalidate. Returns the cached
  // version if present (fast paint), updates the cache in the
  // background.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request)
        .then((res) => {
          // Only cache successful 200s — error pages would stick.
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(VERSION).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});
