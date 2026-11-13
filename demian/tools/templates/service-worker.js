/* Mobile-09: opt-in, bounded, scope-safe offline packs.
 * Never cache authenticated API responses, score submissions, or token-bearing
 * requests. Only same-release *complete* core + game packs serve offline.
 * Do not skipWaiting during gameplay; the menu explicitly accepts updates.
 */
const RELEASE_ID = '__DEMIAN_RELEASE_ID__';
const PREFIX = 'demian-offline-v1-';
const CACHE_NAME = PREFIX + RELEASE_ID;
const CORE_PREFIX = 'demian-core-v1-';
const GAME_PREFIX = 'demian-game-v1-';
const CORE_CACHE = CORE_PREFIX + RELEASE_ID;
const scope = new URL(self.registration.scope);
const offlineURL = new URL('offline.html', scope).href;
const manifestURL = new URL('offline-packs.json', scope).href;
const indexURL = new URL('index.html', scope).href;
const iconURLs = [
    new URL('icons/demian-192.png', scope).href,
    new URL('icons/demian-512.png', scope).href,
];
const marker = key => new URL('__offline_ready/' + key, scope).href;
const gameCache = id => GAME_PREFIX + RELEASE_ID + '-' + id;
let busy = false;

async function isReady(cacheName, key) {
    if (!(await caches.has(cacheName))) return false;
    return Boolean(await (await caches.open(cacheName)).match(marker(key)));
}
async function installedGames(manifest) {
    const coreReady = await isReady(CORE_CACHE, 'core');
    const games = {};
    for (const game of manifest.games) {
        games[game.id] = coreReady && await isReady(gameCache(game.id), game.id);
    }
    return { coreReady, games };
}
async function readManifest() {
    const cache = await caches.open(CACHE_NAME);
    let response = await cache.match(manifestURL);
    if (!response) {
        response = await fetch(manifestURL, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
        if (!response.ok) throw new Error('Offline pack manifest is unavailable.');
        await cache.put(manifestURL, response.clone());
    }
    const manifest = await response.json();
    if (manifest.schema !== 1 || manifest.release !== RELEASE_ID || !Array.isArray(manifest.games)
        || !Array.isArray(manifest.core) || manifest.coreBytes > manifest.maxPackBytes
        || manifest.maxPackBytes > 96 * 1024 * 1024) {
        throw new Error('Offline pack manifest does not match this release.');
    }
    return manifest;
}
function localAsset(record) {
    const path = record?.path;
    if (typeof path !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9/_\-.]*$/.test(path)
        || path.includes('..') || path.startsWith('api/') || path.includes('/api/')) {
        throw new Error('Unsafe offline asset path.');
    }
    const url = new URL(path, scope);
    if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) {
        throw new Error('Offline asset escaped the installation scope.');
    }
    return url.href;
}
async function downloadFiles(cacheName, key, files, notify, initial = 0, total = files.length) {
    const existing = await isReady(cacheName, key);
    if (existing) return initial + files.length;
    // Incomplete downloads are never regarded as ready. A failed transaction
    // deletes its own cache but never touches a previously completed core.
    await caches.delete(cacheName);
    const cache = await caches.open(cacheName);
    let done = initial;
    try {
        for (const record of files) {
            const url = localAsset(record);
            const response = await fetch(url, { cache: 'no-store', credentials: 'omit', redirect: 'error' });
            if (!response.ok || response.type === 'opaque') throw new Error('Offline asset request failed: ' + record.path);
            await cache.put(url, response);
            done++;
            notify({ type: 'PROGRESS', done, total, path: record.path });
        }
        await cache.put(marker(key), new Response('ready:' + RELEASE_ID, {
            headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' },
        }));
        return done;
    } catch (error) {
        await caches.delete(cacheName);
        throw error;
    }
}
async function downloadGame(id, notify) {
    if (busy) throw new Error('Another offline download is running.');
    busy = true;
    try {
        const manifest = await readManifest();
        const game = manifest.games.find(row => row.id === id);
        if (!game || !Array.isArray(game.files) || game.totalBytes > manifest.maxPackBytes) {
            throw new Error('Unsupported or oversized offline game.');
        }
        const total = manifest.core.length + game.files.length;
        const done = await downloadFiles(CORE_CACHE, 'core', manifest.core, notify, 0, total);
        await downloadFiles(gameCache(id), id, game.files, notify, done, total);
        return { id, ...await installedGames(manifest) };
    } finally { busy = false; }
}
async function removeGame(id) {
    if (busy) throw new Error('Wait for the active download to finish.');
    const manifest = await readManifest();
    if (!manifest.games.some(game => game.id === id)) throw new Error('Unknown offline game.');
    await caches.delete(gameCache(id));
    const state = await installedGames(manifest);
    if (!Object.values(state.games).some(Boolean)) {
        await caches.delete(CORE_CACHE);
        state.coreReady = false;
    }
    return state;
}

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache =>
        cache.addAll([offlineURL, manifestURL, ...iconURLs])));
    // A waiting worker never activates in the middle of a game.
});
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => (
            key.startsWith(PREFIX) || key.startsWith(CORE_PREFIX) || key.startsWith(GAME_PREFIX)
        ) && key !== CACHE_NAME && key !== CORE_CACHE &&
            !key.startsWith(GAME_PREFIX + RELEASE_ID + '-')).map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});
self.addEventListener('message', event => {
    if (!event.source?.url) return;
    const caller = new URL(event.source.url);
    if (caller.origin !== scope.origin || !caller.pathname.startsWith(scope.pathname)) return;
    const type = event.data?.type;
    if (type === 'DEMIAN_ACTIVATE_UPDATE') {
        event.waitUntil(self.skipWaiting());
        return;
    }
    if (!['DEMIAN_PACK_STATUS', 'DEMIAN_PACK_DOWNLOAD', 'DEMIAN_PACK_REMOVE'].includes(type)) return;
    const port = event.ports?.[0];
    if (!port) return;
    const notify = payload => port.postMessage(payload);
    event.waitUntil((async () => {
        try {
            let result;
            if (type === 'DEMIAN_PACK_DOWNLOAD') result = await downloadGame(event.data.id, notify);
            else if (type === 'DEMIAN_PACK_REMOVE') result = await removeGame(event.data.id);
            else result = await installedGames(await readManifest());
            notify({ type: 'DONE', ...result });
        } catch (error) {
            notify({ type: 'ERROR', message: String(error?.message ?? 'Offline pack failed.') });
        }
    })());
});
async function fromOfflineCaches(url) {
    // Never serve incomplete caches or unlisted assets. Only current-release
    // resources are used; ignoreSearch supports sprite_rev/cache-busting URLs.
    if (!await isReady(CORE_CACHE, 'core')) return null;
    const manifest = await readManifest();
    const resourcePath = url.pathname.slice(scope.pathname.length);
    const coreAllowed = manifest.core.some(row => row.path === resourcePath);
    if (coreAllowed) {
        const result = await (await caches.open(CORE_CACHE)).match(url.href, { ignoreSearch: true });
        if (result) return result;
    }
    for (const game of manifest.games) {
        if (!game.files.some(row => row.path === resourcePath)) continue;
        if (!await isReady(gameCache(game.id), game.id)) continue;
        const result = await (await caches.open(gameCache(game.id))).match(url.href, { ignoreSearch: true });
        if (result) return result;
    }
    return null;
}
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== scope.origin ||
        !url.pathname.startsWith(scope.pathname)) return;
    // Browsers often use credentials:'include' even for ordinary <img> and
    // font requests. Public, allowlisted static assets may be served offline,
    // but private JSON/fetch GETs and all authenticated/API calls are bypassed.
    const publicStatic = ['image', 'font', 'style', 'script'].includes(request.destination);
    if (/(^|\/)api(\/|$)/.test(url.pathname) ||
        request.headers.has('Authorization') ||
        (request.mode !== 'navigate' && request.credentials === 'include' && !publicStatic)) return;
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const network = await fetch(new Request(request, { cache: 'no-store' }));
                return network;
            } catch {
                return await fromOfflineCaches(new URL(indexURL)) ||
                    await (await caches.open(CACHE_NAME)).match(offlineURL) || Response.error();
            }
        })());
        return;
    }
    if (iconURLs.includes(url.href)) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE_NAME);
            return await cache.match(request) || fetch(request);
        })());
        return;
    }
    event.respondWith((async () => {
        try { return await fetch(request); }
        catch { return await fromOfflineCaches(url) || Response.error(); }
    })());
});
