/* global caches */
// Service worker d'Animots : l'application s'ouvre même sans connexion, et les moteurs de voix
// déjà téléchargés (fichiers de jsDelivr) ne sont pas retéléchargés.
//
// Fichiers de l'application : réseau d'abord (les mises à jour arrivent tout de suite), cache sinon.
// Fichiers externes versionnés (jsDelivr, polices) : cache d'abord.

const VERSION = "animots-dev";
const SHELL = `${VERSION}-shell`;
const CDN = "animots-cdn-v1";
const FILES = [
  "./", "./index.html", "./styles.css", "./manifest.webmanifest",
  "./img/logo.svg", "./img/icon-192.png", "./img/icon-512.png",
  "./js/app.js", "./js/account.js", "./js/audio.js", "./js/export.js", "./js/figure.js", "./js/i18n.js",
  "./js/kokoro-worker.js", "./js/poses.js", "./js/pwa.js", "./js/renderer.js", "./js/scenery.js", "./js/script.js",
  "./js/styles.js", "./js/translate.js", "./js/voice.js", "./js/voicefx.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== CDN) await caches.delete(k);
    await self.clients.claim();
  })());
});

const CDN_HOSTS = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // Comptes, partage et pages du serveur : jamais en cache.
    if (/^\/(api|v|legal|reset)\b/.test(url.pathname)) return;
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && res.type === "basic") (await caches.open(SHELL)).put(req, res.clone());
        return res;
      } catch {
        return (await caches.match(req, { ignoreSearch: true })) ?? (req.mode === "navigate" ? caches.match("./index.html") : Response.error());
      }
    })());
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") (await caches.open(CDN)).put(req, res.clone()).catch(() => {});
      return res;
    })());
  }
});
