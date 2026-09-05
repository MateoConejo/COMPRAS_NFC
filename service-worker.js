/**
 * service-worker.js — permite que "Mis compras" funcione 100% offline
 * después de la primera carga.
 *
 * Estrategia: cache-first para el "app shell". Los datos (alimentos,
 * categorías) NUNCA pasan por aquí: viven solo en IndexedDB (ver db.js).
 *
 * Si actualizas el código de la app, sube el número de CACHE_VERSION
 * para que los usuarios reciban la versión nueva la próxima vez que
 * tengan conexión.
 */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `mis-compras-${CACHE_VERSION}`;

// Rutas relativas al scope del Service Worker (funciona también si la
// app se despliega en una subcarpeta, p. ej. usuario.github.io/repo/).
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './app.js',
  './db.js',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('mis-compras-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Solo interceptamos peticiones GET propias de la app (mismo origen).
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          // Guarda en caché una copia de cualquier recurso nuevo del mismo
          // origen para que también quede disponible offline la próxima vez.
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Sin red y sin caché: si es una navegación, devuelve el shell.
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return undefined;
        });
    })
  );
});
