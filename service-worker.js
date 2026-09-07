const PREFIX = "gamecenter-shell-";
const CACHE = "gamecenter-shell-v2";
const ASSETS = [
  "./", "./index.html", "./styles.css?v=2", "./manifest.webmanifest",
  "./assets/arcade-lounge.webp", "./assets/app-icon-192.png", "./assets/app-icon-512.png",
  "./assets/apple-touch-icon.png", "./assets/favicon-48.png",
  "./assets/games/googlefeud.webp", "./assets/games/sameslate.webp", "./assets/games/henrythetrain.webp",
  "./src/app.js?v=2", "./src/catalog.js", "./src/config.js", "./src/identity.js",
  "./src/services/audio.js", "./src/services/music.js", "./src/services/player-session.js"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))); self.skipWaiting();
});
self.addEventListener("activate", event => {
  // All games share an origin. Never delete another game's offline cache.
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url), scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  const allowed = ASSETS.some(path => new URL(path, scope).pathname === url.pathname);
  if (!allowed && event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && allowed && !url.searchParams.has("play")) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === "navigate" ? await caches.match(new URL("./index.html", scope).href) : Response.error())));
});
