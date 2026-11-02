// Crux service worker. Hashed assets come from the cache; the page and every API read go to the network first and fall
// back to the last copy, so Crux opens read-only without a connection. There is no skipWaiting: a new version
// installs in the background and takes over the next time Crux is opened, never in the middle of a task.
const VERSION = new URL(location).searchParams.get('v') || 'dev';
const CACHE = `crux-${VERSION}`;
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('crux-') && k !== CACHE).map((k) => caches.delete(k)))));
});

const networkFirst = async (req, key = req) => {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;
    throw new Error('offline');
  }
};

const cacheFirst = async (req) => {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
  return res;
};

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/assets/')) return e.respondWith(cacheFirst(e.request));
  // API reads: the network first, the last copy when offline. Downloads, sign-in and the PDF viewer's bytes are never kept.
  if (url.pathname.startsWith('/api/') && !/(^\/api\/me$|\/download$|^\/api\/files\/bytes$)/.test(url.pathname)) return e.respondWith(networkFirst(e.request));
  if (e.request.mode === 'navigate') return e.respondWith(networkFirst(e.request, '/'));
});
