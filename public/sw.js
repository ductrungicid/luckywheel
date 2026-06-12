const CACHE_NAME = "lucky-wheel-v1";
const STATIC_ASSETS = [
  "/",
  "/play",
  "/settings",
  "/styles.css",
  "/app.js",
  "/settings.js",
  "/pwa.js",
  "/manifest.webmanifest",
  "/resource/play.png",
  "/resource/settings.png",
  "/resource/done.png",
  "/resource/triangle-arrow.png",
  "/resource/pwa-192.png",
  "/resource/pwa-512.png",
  "/resource/maskable-512.png",
  "/resource/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.pathname === "/api/settings") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await caches.match(url.pathname);
        return cached || caches.match("/play");
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  );
});
