const CACHE = 'surrender-desk-cloud-v6-' + self.registration.scope;
const ASSETS = ['./index.html', './app.js', './policy.js', './vendor/qrcode.js', './manifest.webmanifest', './favicon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (['phone-surrender-v1', 'phone-surrender-v2', 'phone-surrender-v3'].includes(key) || (key !== CACHE && key.startsWith('surrender-desk-') && key.endsWith(self.registration.scope))) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (!url.href.startsWith(self.registration.scope)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.open(CACHE)).match('./index.html')));
    return;
  }
  if (!ASSETS.some(asset => new URL(asset, self.registration.scope).pathname === url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const key = new URL(url.pathname, url.origin).href;
    try {
      const response = await fetch(request);
      if (response.ok) await cache.put(key, response.clone());
      return response;
    } catch (_) { return (await cache.match(key)) || Response.error(); }
  })());
});
