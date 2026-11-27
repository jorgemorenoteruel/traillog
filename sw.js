/* TrailLog Pro — guarda la app en el dispositivo para que abra sin conexión. No toca tus datos ni las peticiones a otros sitios. */
const VERSION = '2026.11.12';
const CACHE = 'traillog-pro-' + VERSION;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'icon-180.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('traillog-pro-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // intervals.icu y cualquier otro sitio: sin intervenir
  if (req.mode === 'navigate') {
    // La página: primero la red (para recibir versiones nuevas) y, sin conexión, la copia guardada.
    // 'no-cache': pregunta siempre al servidor si cambió (barato: responde «sin cambios»), sin fiarse de la copia de 10 minutos de GitHub Pages.
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put('index.html', copy)); }
        return res;
      }).catch(() => caches.match('index.html').then((r) => r || caches.match('./')))
    );
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
