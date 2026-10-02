// Service worker — mode hors-ligne du Quiz.
// Stratégie : network-first (on privilégie le réseau pour rester à jour avec les
// nouvelles questions du jour), avec repli sur le cache si pas de connexion.
const CACHE = 'quiz-cache-v2';
const CORE = [
  './',
  './index.html',
  './css/app.css',
  './js/state.js',
  './js/culture.js',
  './js/geo.js',
  './js/daily.js',
  './js/main.js',
  './manifest.json',
  './questions.json',
  './data/departements.json',
  './data/departements.geojson',
  './data/regions.json',
  './data/regions.geojson',
  './data/countries.json',
  './data/countries.geo.json',
  './data/us-states.json',
  './data/us-states.geojson',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE).catch(() => {})) // best-effort
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // On met à jour le cache au passage (copie).
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request)) // hors-ligne : on sert le cache
  );
});
