self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    const title = data.title || "Shasha Nails Recordatorio";
    const options = {
      body: data.body,
      icon: '/vite.svg',
      vibrate: [200, 100, 200, 100, 200, 100, 200],
      requireInteraction: true
    };
    event.waitUntil(self.registration.showNotification(title, options));
  }
});
