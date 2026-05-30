// service-worker.js - Service Worker básico para PWA
const CACHE_NAME = 'financezas-v1';
const urlsToCache = [
  '/financezas/',
  '/financezas/index.html',
  '/financezas/manifest.json'
];

self.addEventListener('install', event => {
  console.log('[SW] Instalado');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] Ativado');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});