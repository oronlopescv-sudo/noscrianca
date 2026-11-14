// Service worker do NosCriança: instalação como app + página offline.
// Nunca guarda em cache páginas com dados (são sempre pedidas ao servidor).
// «nc-static-dev» só serve em desenvolvimento: no Dockerfile, ao montar a
// imagem, os marcadors são trocados por «nc-static-<BUILD_ID>» — cada deploy
// recebe o seu nome de cache e os caches antigos são eliminados no activate.
const CACHE = "nc-static-dev";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE_URL, "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    // Chunks com hash no nome: cache-first seguro (nunca mudam de conteúdo).
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
    return;
  }
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest") {
    // Sem hash de conteúdo: rede primeiro, cache só quando offline.
    event.respondWith(
      fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then((hit) => hit ?? caches.match(OFFLINE_URL))),
    );
  }
});
