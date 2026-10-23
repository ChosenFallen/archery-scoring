// Offline support: the app's files are cached on first visit so it works at the range without signal.
// Bump VERSION when the list of files changes.
const VERSION = 'v3';
const CACHE = `archery-${VERSION}`;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/rules.js',
  'js/store.js',
  'js/face.js',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('archery-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first, so updates show up straight away when online. If the network is missing or
// too slow (weak signal at the range), the cached copy is used instead.
const NETWORK_TIMEOUT_MS = 3000;

async function networkThenCache(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      // 'no-cache' makes the browser check with the server instead of reusing its own
      // copy (GitHub Pages lets browsers reuse files for 10 minutes otherwise).
      fetch(req, { cache: 'no-cache' }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === 'navigate') return cache.match('index.html');
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(networkThenCache(req));
});
