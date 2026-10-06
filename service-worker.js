// Retire the legacy root worker when uploading the complete package to GitHub Pages.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (['phone-surrender-v1','phone-surrender-v2','phone-surrender-v3'].includes(key)) await caches.delete(key);
  await self.clients.claim();
  await self.registration.unregister();
})()));
