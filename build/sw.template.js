/* R.J QUIZ - Quiz Master Pro service worker.
 *
 * The build id and the precache manifest below are stamped in at build time by build/vite-plugins.ts.
 *
 * Strategy
 *  - Install:    precache every file of the build, so the whole app works offline after the first visit.
 *  - Navigation: network first (short timeout) so updates show up quickly, falling back to the cached app shell.
 *  - Same-origin static files: cache first; anything not precached is cached on first use.
 *  - /api/ calls and cross-origin requests are never touched - the app handles its own offline fallbacks.
 *  - Updates:    a new worker waits until the old one is released (no surprise mid-session reloads);
 *                the page can send {type:'SKIP_WAITING'} to apply it immediately.
 */
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = __PRECACHE_MANIFEST__;
const CACHE_PREFIX = 'qmp-';
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const SCOPE = self.registration.scope;
const SHELL_URL = new URL('./index.html', SCOPE).href;
const NAV_TIMEOUT_MS = 3500;

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // `reload` bypasses the HTTP cache so a half-stale precache can never be built.
      await cache.addAll(PRECACHE.map(url => new Request(new URL(url, SCOPE).href, { cache: 'reload' })));
      // First install: activate immediately so the app is offline-ready right away.
      if (!self.registration.active) await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

async function handleNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await withTimeout(fetch(request), NAV_TIMEOUT_MS);
    // Only the real app shell is worth refreshing; ignore hosting error pages.
    if (response.ok && response.type === 'basic') cache.put(SHELL_URL, response.clone()).catch(() => {});
    return response;
  } catch (_) {
    const shell = await cache.match(SHELL_URL);
    if (shell) return shell;
    return new Response('Offline and the app is not cached yet. Open it once while online.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function handleStatic(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }
  event.respondWith(handleStatic(request));
});
