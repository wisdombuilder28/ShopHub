/* ==========================================
   ShopHub — Service Worker (PWA)
   Cache-first for static assets.
   /api/ calls are NEVER cached — always live.
   ========================================== */

const CACHE_VERSION = 'shophub-v2.1.0';
const STATIC_ASSETS = [
    './',
    './index.html',
    './product.html',
    './checkout.html',
    './styles.css',
    './app.js',
    './chat.js',
    './manifest.json',
    './data/products.json',
    './icons/icon-192.png',
    './icons/icon-72.png',
    './icons/icon-96.png',
    './icons/icon-128.png',
    './icons/icon-144.png',
    './icons/icon-152.png',
    './icons/icon-180.png',
    './icons/icon-192.png',
    './icons/icon-384.png',
    './icons/icon-512.png'
];

/* ---- Install ---- */
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_VERSION).then(cache => cache.addAll(STATIC_ASSETS)).catch(() => {})
    );
});

/* ---- Activate: purge old caches ---- */
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

/* ---- Fetch ---- */
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle GET
    if (request.method !== 'GET') return;

    // NEVER cache API calls or external requests
    if (url.pathname.startsWith('/api/')) return;
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.match(request).then(cached => {
            // Background refresh
            const networkFetch = fetch(request).then(res => {
                if (res && res.ok) {
                    caches.open(CACHE_VERSION).then(c => c.put(request, res.clone()));
                }
                return res;
            }).catch(() => {});

            return cached || networkFetch || (
                request.mode === 'navigate'
                    ? caches.match('./index.html')
                    : new Response('Offline', { status: 503 })
            );
        })
    );
});
