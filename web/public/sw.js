/* Picolah service worker: cache hashed Vite assets, never cache API responses. */
const CACHE = 'picolah-assets-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      // No clients.claim() on purpose: claiming a page mid-load can abort the
      // subresource requests it already started (first visit showed no images
      // until a reload). New visits are controlled on their next navigation.
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/go/')) return;

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        // Respond first, then persist: a slow cache write must never stall the page.
        if (response.ok) event.waitUntil(cache.put(request, response.clone()));
        return response;
      })(),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match('/')) || Response.error();
      }),
    );
  }
});
