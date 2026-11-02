/* The build step replaces this token with the finite application shell asset list. */
const PRECACHE_ASSETS = ["/assets/app-bootstrap-CCCwb77U.css","/assets/app-bootstrap-CpZm4uWq.js","/assets/app-shell-CrojkZxx.js","/assets/catalogue.worker-Cmifh3cz.js","/assets/index-BhVhxGnm.css","/assets/index-Cn94n4k4.js","/assets/theme-Dubfbby_.js","/assets/theme-mhmZZqUX.js","/assets/website-C_-i1UU3.css","/assets/website-aFGBNYFj.js"];
const SHELL_CACHE = 'partavar-shell-367fd2a4a7414093';
const SHELL_URLS = ['/app/', '/manifest.webmanifest', ...PRECACHE_ASSETS];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll([...new Set(SHELL_URLS)]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if ((key.startsWith('partavar-shell-') || key.startsWith('partsfinder-shell-')) && key !== SHELL_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate' && /^\/app(?:\/|$)/.test(url.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        // The fallback HTML belongs to this immutable shell revision.
        return response;
      } catch {
        return (await caches.match('/app/')) || Response.error();
      }
    })());
    return;
  }
  if (PRECACHE_ASSETS.includes(url.pathname) || url.pathname === '/manifest.webmanifest') {
    event.respondWith((async () => {
      // Cache by the allowlisted path: same-origin script/style requests may carry
      // an Origin header that differs from the precache request's Vary values.
      const cache = await caches.open(SHELL_CACHE);
      return (await cache.match(url.pathname)) || fetch(request);
    })());
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'VERIFY_SHELL' || !event.ports[0]) return;
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const required = [...SHELL_URLS, ...(Array.isArray(event.data.paths) ? event.data.paths.filter(path => typeof path === 'string' && path.startsWith('/assets/')) : [])];
    const present = await Promise.all([...new Set(required)].map(async path => Boolean(await cache.match(path))));
    event.ports[0].postMessage({ ready: present.every(Boolean) });
  })());
});
