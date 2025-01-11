/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("install", () => {
  // The promise that skipWaiting() returns can be safely ignored.
  self.skipWaiting();

  // Perform any other actions required for your
  // service worker to install, potentially inside
  // of event.waitUntil();
});

// You may need these listeners if you plan to handle push notifications:
self.addEventListener('push', event => {
  if (!event.data) return

  // Convert the push message data to JSON (or text, depending on how you send it)
  const msg = event.data.json()

  // console.log('This push event has data: ', msg);

  if (msg.type === 'streamStarted') {
    event.waitUntil(
      self.registration.showNotification('放送が始まりました')
    );
  } else if (msg.type === 'streamEnded') {
    event.waitUntil(
      self.registration.showNotification('放送が終わりました')
    );
  } else if (msg.type === 'summary') {
    event.waitUntil(
      self.registration.showNotification('放送がありました', {
        body: msg.summary,
        data: {
          id: msg.streamId,
        }
      })
    );
  }
})

// You can also handle what happens when the user clicks a notification
self.addEventListener('notificationclick', event => {
  event.notification.close()
  // console.log('Notification clicked:', event);

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window' });
    const urlToOpen = new URL('/', self.location.origin).href;

    const clientForUrl = async () => {
      // Check if there’s already a window/tab open with this URL
      for (const client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window/tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    };
    const client = await clientForUrl();
    if (client) {
      const data = event.notification.data || {};
      const msg = { type: 'open-notif', id: data.id };
      client.postMessage(msg);
    }
  })());
});
