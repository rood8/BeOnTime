const CACHE = 'punctuality-pwa-v1';
const ASSETS = ['./', './index.html', './style.css', './app.js', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'REMINDER') {
    self.registration.showNotification('Time to leave', {
      body: `Leave now for ${event.data.title}. Destination: ${event.data.destination}`,
      icon: './icon-192.png',
      badge: './icon-192.png'
    });
  }
});
