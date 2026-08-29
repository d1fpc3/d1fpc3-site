// Echelon members app — service worker. Web push only: no caching, no
// offline shell. The page registers this at boot; send-push (VAPID) posts
// {title, body, path} and a tap opens that path in the app.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = { title: 'Echelon', body: e.data ? e.data.text() : '' } }
  const title = data.title || 'Echelon'
  const path = data.path || '/echelon/app/'
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/echelon/assets/logo-mark.png',
    badge: '/echelon/assets/logo-mark.png',
    tag: data.tag || path,
    renotify: !!data.tag,
    data: { path },
  }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const path = (e.notification.data && e.notification.data.path) || '/echelon/app/'
  const url = new URL(path, self.location.origin).href
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (c.url.startsWith(self.location.origin + '/echelon/app')) {
        try { await c.focus() } catch {}
        try { await c.navigate(url) } catch {}
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
