// WakkaChat Service Worker v11
const CACHE_NAME = 'wakkachat-v11';
const STATIC_ASSETS = [
  '/',
  '/static/js/main.chunk.js',
  '/static/js/bundle.js',
  '/manifest.json',
  '/logo192.png',
];

// インストール時：静的アセットをキャッシュ
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
});

// 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// フェッチ戦略：APIはネットワーク優先、静的ファイルはキャッシュ優先
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API・WebSocketは常にネットワーク
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket')) return;

  // 静的アセット：キャッシュ優先 → ネットワークフォールバック
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // オフライン時はキャッシュされたindex.htmlを返す
          if (event.request.destination === 'document') {
            return caches.match('/');
          }
        });
      })
    );
  }
});

// Push通知
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'WakkaChat';
  const options = {
    body: data.body || '新しいメッセージがあります',
    icon: '/logo192.png',
    badge: '/logo192.png',
    tag: data.tag || 'message',
    data: data.url || '/',
    vibrate: [200, 100, 200],
    requireInteraction: false,
    actions: [
      { action: 'open', title: '開く' },
      { action: 'close', title: '閉じる' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 通知クリック
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data || '/');
    })
  );
});

// バックグラウンド同期（オフライン時に送信したメッセージを後で送信）
self.addEventListener('sync', (event) => {
  if (event.tag === 'send-messages') {
    event.waitUntil(
      self.registration.showNotification('WakkaChat', {
        body: 'オフライン中のメッセージを送信したで！',
        icon: '/logo192.png',
      })
    );
  }
});
