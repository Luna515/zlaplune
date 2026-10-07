// Service worker: pamięta tylko pliki strony (wygląd i skrypty), nigdy dane z kalendarza.
// Zapytania do Supabase, EmailJS i Telegrama (inne domeny) idą zawsze prosto do sieci.

const CACHE = 'zaplune-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('zaplune-shell-') && k !== CACHE).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }
  // pliki z hashem w nazwie nigdy się nie zmieniają, więc można je brać z pamięci
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(req));
  }
});

// Strona: zawsze świeża z sieci; bez internetu ostatnia zapamiętana wersja.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put('/index.html', res.clone());
    return res;
  } catch {
    return (await cache.match('/index.html')) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}
