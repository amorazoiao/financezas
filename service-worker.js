// =============================================================================
// service-worker.js — Cache e suporte offline para o FinanÇezas PWA
// =============================================================================

const CACHE_NAME = 'financezas-v1';

// Todos os arquivos do app que devem ser cacheados para funcionar offline
const ARQUIVOS = [
  '/financezas/',
  '/financezas/index.html',
  '/financezas/manifest.json',
  '/financezas/css/main.css',
  '/financezas/js/dialogs.js',
  '/financezas/js/utils.js',
  '/financezas/js/storage.js',
  '/financezas/js/recorrencias.js',
  '/financezas/js/dashboard.js',
  '/financezas/js/cartoes.js',
  '/financezas/js/transacoes.js',
  '/financezas/js/orcamentos.js',
  '/financezas/js/configuracoes.js',
  '/financezas/js/exportacoes.js',
  '/financezas/js/app.js',
  '/financezas/icons/icon-192.png',
  '/financezas/icons/icon-512.png',
];

// ---------- Instalação: cacheia todos os arquivos ----------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())  // ativa imediatamente sem esperar fechar abas
  );
});

// ---------- Ativação: remove caches antigos ----------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())  // assume controle de todas as abas abertas
  );
});

// ---------- Fetch: Cache First para arquivos locais, Network First para CDN ----------
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Recursos externos (CDN): tenta rede primeiro, cai no cache se offline
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Salva uma cópia no cache para uso offline
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Recursos locais: cache primeiro (app funciona 100% offline)
  event.respondWith(
    caches.match(event.request)
      .then(cached => cached || fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        })
      )
  );
});
