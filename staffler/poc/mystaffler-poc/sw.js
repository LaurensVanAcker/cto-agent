/**
 * Service worker for the MyStaffler-PoC. Two caches:
 *
 *   SHELL  — pre-populated at install with index.html + JS + CSS + icons.
 *            Hit first for non-/api requests (cache-first, falls back
 *            to network on cache miss, refreshes the cache in the
 *            background on every successful network response).
 *
 *   API    — populated on every successful /api/* GET. Network-first,
 *            so a fresh fetch always wins when online; falls back to
 *            the cached copy when the network is down. POST / PUT /
 *            DELETE never touch the cache (mutations).
 *
 * Auth-sensitive endpoints (/api/employee-login, /api/logout) are
 * pass-through — never cached, never served from cache — so a stale
 * sessie cookie can't leak across users.
 *
 * Bumps `VERSION` to bust both caches on every release. Operators
 * can also hit Settings → Storage → Clear if a deploy hits a sw
 * cache that won't budge.
 */
const VERSION = 'mystaffler-poc-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const API_CACHE = `${VERSION}-api`;

const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon-192.svg',
  '/icon-512.svg',
  '/src/dist/main.js',
  '/src/dist/api.js',
  '/src/dist/state.js',
  '/src/dist/fcm.js',
  '/src/styles.css',
];

/** GET endpoints whose response is safe to cache for offline replay.
 *  Anything not on this list bypasses the API cache entirely. */
const API_CACHEABLE = [
  '/api/me',
  '/api/my-shifts',
  '/api/availabilities',
  '/api/notifications',
];

function isApiCacheable(pathname) {
  return API_CACHEABLE.some((p) => pathname === p || pathname.startsWith(p + '?'));
}

self.addEventListener('install', (event) => {
  // skipWaiting → the next page load uses the new SW immediately
  // (otherwise the user has to close every tab first, which is a
  // demo-killer).
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL).catch(() => {})),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Take control of any open tabs so the new SW handles their
      // fetches without a manual refresh.
      self.clients.claim(),
      // Drop every cache that isn't tied to the current VERSION (both
      // shell and api buckets), including caches from prior versions.
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== API_CACHE)
            .map((k) => caches.delete(k)),
        ),
      ),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Don't touch cross-origin: let the browser default handle it.
  if (url.origin !== self.location.origin) return;
  // Mutations always bypass the cache (POST / PUT / PATCH / DELETE).
  if (event.request.method !== 'GET') return;

  // /api/* — network-first with a cache fallback for the read-only
  // endpoints we whitelisted. Auth-sensitive paths are pass-through.
  if (url.pathname.startsWith('/api/')) {
    if (!isApiCacheable(url.pathname)) {
      // Pass-through — login / logout / mutations rely on real network.
      // We still wrap the fetch so a failure surfaces a typed offline
      // response instead of the browser default.
      event.respondWith(
        fetch(event.request).catch(
          () =>
            new Response(
              JSON.stringify({ kind: 'offline', message: 'Geen verbinding.' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } },
            ),
        ),
      );
      return;
    }
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(API_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) {
            // Tag the response so the client can show "offline cache"
            // in a banner / dev tools.
            const body = await cached.clone().text();
            return new Response(body, {
              status: cached.status,
              statusText: cached.statusText,
              headers: {
                ...Object.fromEntries(cached.headers.entries()),
                'x-mystaffler-offline-cache': '1',
              },
            });
          }
          return new Response(
            JSON.stringify({ kind: 'offline', message: 'Geen verbinding.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          );
        }),
    );
    return;
  }

  // Everything else — cache-first for the shell with a background
  // refresh. Returns the cached version on hit (fast paint), updates
  // the cache in the background. Only 200s are cached so error pages
  // don't stick.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetched = fetch(event.request)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});
