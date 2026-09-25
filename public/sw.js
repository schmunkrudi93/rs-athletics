/* RS Athletics — Service Worker
 * Minimaler, robuster Cache:
 *  - Navigations: network-first mit Offline-Fallback aus dem Cache
 *  - statische Assets: stale-while-revalidate
 *  - /api/* wird NIE gecacht
 */
const CACHE = 'rs-athletics-v2';
const APP_SHELL = '/';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // dynamische Daten nie cachen

  // Seitenaufrufe: erst Netzwerk, sonst Cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match(request)) || (await cache.match(APP_SHELL)) || Response.error();
        }
      })(),
    );
    return;
  }

  // Statische Assets: aus Cache liefern und im Hintergrund auffrischen.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((resp) => {
          if (resp && resp.status === 200) cache.put(request, resp.clone());
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })(),
  );
});
