/* d1 trading service worker: web push display + click-through. */
self.addEventListener('push', (e) => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { /* ignore */ }
  e.waitUntil(self.registration.showNotification(data.title || 'd1 trading', {
    body: data.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    data: { url: data.url || '/trading/' },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/trading/'
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) {
      if (c.url.includes('/trading') && 'focus' in c) { c.navigate(url); return c.focus() }
    }
    return clients.openWindow(url)
  }))
})
