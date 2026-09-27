// Generated at build time by apps/web/vite.config.ts. Cache-first; everything is precached on install.
const CACHE = 'qrc-00675e631005';
const FILES = ["./","./index.html","./assets/index-Br--l9NF.js","./assets/index-BkZQSzcK.css","./assets/worker-Cts7ctCo.js","./assets/zxing_reader-Bb9Mx2Pu.wasm","./icons/icon-192.png","./icons/icon-512.png","./manifest.webmanifest"];
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('qrc-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const index = await cache.match('./index.html') || await cache.match('./');
      if (index) return index;
    }
    return fetch(req);
  })());
});
