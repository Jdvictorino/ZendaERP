const CACHE_NAME = 'zenda-erp-v2';

// Assets estáticos que se cachean al instalar
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/icon.svg',
];

// Instalar: cachear assets estáticos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activar: limpiar caches antiguos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network-first para API, Cache-first para assets
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ignorar esquemas no soportados (extensiones, etc.) y métodos no GET
  if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) {
    return;
  }
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // API calls o dominios de API: siempre a la red directa
  if (url.pathname.startsWith('/api/') || url.hostname.startsWith('api.')) {
    return;
  }

  // Navigation requests: network-first con fallback a cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Assets estáticos: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Solo cachear respuestas válidas de origen propio
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
