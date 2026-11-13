/* Mobile-07: scoped, network-first navigation with safe offline fallback.
 * Intentionally DOES NOT precache the atomic game JS, CSS, character packs or
 * authenticated API. An old HTML/JS mix across an atomic deploy would fail;
 * ranked scores must never appear to submit while offline.
 *
 * This file is rendered by tools/export_static.mjs per content-hashed release.
 */
const RELEASE_ID = '__DEMIAN_RELEASE_ID__';
const PREFIX = 'demian-offline-v1-';
const CACHE_NAME = PREFIX + RELEASE_ID;
const scope = new URL(self.registration.scope);
const offlineURL = new URL('offline.html', scope).href;
const iconURLs = [
    new URL('icons/demian-192.png', scope).href,
    new URL('icons/demian-512.png', scope).href,
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache =>
        cache.addAll([offlineURL, ...iconURLs])));
    // Do not skipWaiting automatically: live gameplay may be in progress.
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE_NAME)
            .map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    if (event.data?.type !== 'DEMIAN_ACTIVATE_UPDATE') return;
    // Only the same-origin controlled page can trigger an update activation.
    if (!event.source?.url || new URL(event.source.url).origin !== scope.origin) return;
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== scope.origin ||
        !url.pathname.startsWith(scope.pathname)) return;

    // Never intercept score submissions, tokens or API responses, even when
    // a same-origin API is hosted under the installation scope.
    if (/(^|\/)api(\/|$)/.test(url.pathname) ||
        request.headers.has('Authorization') ||
        (request.mode !== 'navigate' && request.credentials === 'include')) return;

    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const response = await fetch(new Request(request, { cache: 'no-store' }));
                if (response.ok) return response;
                // HTTP 4xx/5xx is a server response, not an offline state.
                return response;
            } catch {
                return (await caches.open(CACHE_NAME)).match(offlineURL)
                    ?? Response.error();
            }
        })());
    } else if (iconURLs.includes(url.href)) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            return (await cache.match(request)) ?? fetch(request);
        })());
    }
});
