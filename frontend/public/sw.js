/* Plugy service worker: push notifications only (no offline caching, so deploys are never stale). */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Plugy', body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    (async () => {
      // Plugy is open and on screen: the in-app notification already covers it
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (windows.some((w) => w.visibilityState === 'visible')) return;

      await self.registration.showNotification(data.title || 'Plugy', {
        body: data.body || '',
        tag: data.tag,
        renotify: !!data.tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: data.url || '/' },
      });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        existing.postMessage({ type: 'open-url', url });
        return;
      }
      await self.clients.openWindow(url);
    })()
  );
});
