/* Service Worker — Carte d'Eridune (Reiseatlas) v1 */
const VERSION = 'atlas-v1.0.0';
const CORE = ['./', './index.html', './app.js', './manifest.webmanifest', './icon.svg'];

/* Daten und Kartenbild liegen nebenan im Repo, außerhalb der Scope */
const DATEN = new URL('../werkstatt/werkstatt-daten.json', self.location).href;
const SCOPE = new URL('./', self.location).pathname;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Externes (Fonts, Wiki-Links) unberührt lassen

  // Kartendaten: Netz zuerst, Fallback Cache (offline lesbar).
  // Cache unter der blanken URL, damit Cache-Buster (?) den Cache nicht aufblähen.
  if (url.pathname === new URL(DATEN).pathname) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(DATEN, copy));
        return res;
      }).catch(() => caches.match(DATEN))
    );
    return;
  }

  // Navigation innerhalb des Atlas: Shell aus Cache, sonst Netz.
  // (Navigations ins Wiki macht der Browser selbst, ohne den Worker.)
  if (req.mode === 'navigate' && url.pathname.indexOf(SCOPE) === 0) {
    e.respondWith(caches.match('./index.html').then((hit) => hit || fetch(req)));
    return;
  }

  // Übrige Assets (Shell, Kartenbild, Fonts-Weiterleitungen): Stale-while-revalidate
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
