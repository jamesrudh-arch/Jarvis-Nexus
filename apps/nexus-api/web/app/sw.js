/* JARVIS Voice PWA service worker — offline app shell.
 * Strategy:
 *  - CODE ASSETS (html/js/css): network-first — users get updates promptly;
 *    the cached copy is the offline fallback, never a stale default.
 *  - ICONS/MANIFEST: cache-first (immutable-ish).
 *  - API + auth: always the network (never cache dialogue or credentials). */
"use strict";

const CACHE = "jarvis-voice-v2";
const SHELL = [
  "/app/",
  "/app/index.html",
  "/app/style.css",
  "/app/app.js",
  "/app/manifest.webmanifest",
  "/app/icon-192.png",
  "/app/icon-512.png",
  "/app/apple-touch-icon.png",
];
const NETWORK_FIRST = ["/app/", "/app/index.html", "/app/app.js", "/app/style.css", "/app/sw.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  // API + auth: always the network (never cache dialogue or credentials)
  if (!url.pathname.startsWith("/app/")) return;
  const cacheable = caches.open(CACHE);
  if (NETWORK_FIRST.includes(url.pathname)) {
    e.respondWith(
      fetch(e.request)
        .then((res) => { cacheable.then((c) => c.put(e.request, res.clone())); return res; })
        .catch(() => caches.match(e.request, { ignoreSearch: true })),
    );
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit ?? fetch(e.request)),
  );
});
