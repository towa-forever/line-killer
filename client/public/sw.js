// LINE Killer Service Worker

const CACHE_NAME = 'line-killer-v1';
const STATIC_ASSETS = ['/', '/static/js/', '/static/css/'];

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Push通知
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'LINE Killer';
  const options = {
    body: data.body || '新しいメッセージがあります',
    icon: '/logo192.png',
    badge: '/logo192.png',
    tag: data.tag || 'message',
    data: data.url || '/',
    vibrate: [200, 100, 200],
    requireInteraction: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
