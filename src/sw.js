/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'

self.skipWaiting()
self.addEventListener('activate', () => self.clients.claim())

precacheAndRoute(self.__WB_MANIFEST)

async function getClientsList() {
  return self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'add-250' || event.action === 'add-500') {
    const amount = event.action === 'add-250' ? 250 : 500
    event.waitUntil(
      (async () => {
        const clientsList = await getClientsList()
        if (clientsList.length > 0) {
          clientsList[0].postMessage({ type: 'LOG_WATER', amount })
          clientsList[0].focus()
        } else {
          const client = await self.clients.openWindow('/?add=' + amount)
          if (client) client.focus()
        }
      })(),
    )
    return
  }

  event.waitUntil(
    (async () => {
      const clientsList = await getClientsList()
      if (clientsList.length > 0) {
        clientsList[0].focus()
      } else {
        await self.clients.openWindow('/')
      }
    })(),
  )
})
