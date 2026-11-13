import CanvasCharacterAvatar from '../CanvasCharacterAvatar.js';
import {
    BUILTIN_CHARACTER_SLUGS,
    DEFAULT_ACTIVE_SLUG,
    builtinCharacterAssetPair,
    normalizeSpriteVariant,
    characterSpriteRevisionUrl,
} from '../CharacterVisualContract.js';
import { orderedSpriteVariants, characterRuntimeVariants, CHARACTER_ASSET_TIMEOUT_MS } from './CharacterRuntimePolicy.js';
import {
    SpriteLoadGate, spriteCacheBudgetBytes, cachedSpriteBytes, trimSpriteCache,
} from './SpriteMemoryPolicy.js';
import { abortedError, isAborted, isTransientAssetError, withTransientRetry } from './MobileNetworkPolicy.js';

const STORAGE_KEY = 'demian.character.slug.v1';
const LOAD_TIMEOUT_MS = CHARACTER_ASSET_TIMEOUT_MS;
function safeStorage() {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
}

function readStoredSlug(storage) {
    try {
        const value = storage?.getItem?.(STORAGE_KEY);
        return BUILTIN_CHARACTER_SLUGS.includes(value) ? value : null;
    } catch {
        return null;
    }
}

export default class CharacterVisualService {
    constructor({ eventBus, performanceProfile = null, storage = safeStorage() } = {}) {
        this.eventBus = eventBus;
        this.performanceProfile = performanceProfile;
        this.storage = storage;
        this.activeSlug = readStoredSlug(storage) ?? DEFAULT_ACTIVE_SLUG;
        this.packPromises = new Map();
        this.pendingLoadMeta = new Map();
        this.packCache = new Map();
        this.failedPairs = new Map();
        this.controllers = new Set();
        this.disposed = false;
        this.cacheBudgetBytes = spriteCacheBudgetBytes(performanceProfile);
        this.loadGate = new SpriteLoadGate(performanceProfile?.tier === 'performance' ? 1 : 2);
        this.counters = { hits: 0, misses: 0, fallbacks: 0, evictions: 0,
            failedPairs: 0, transientRetries: 0, backgroundCancelled: 0 };
        this.unsubscribe = [];
        this.onOnline = () => this.clearTransientFailures();
        globalThis.window?.addEventListener?.('online', this.onOnline);

        if (eventBus?.on) {
            this.unsubscribe.push(eventBus.on('character:selected', ({ record } = {}) => {
                this.setActiveSlug(record?.slug);
            }));
            this.unsubscribe.push(eventBus.on('characters:changed', (characters = []) => {
                const active = characters.find((character) => character?.is_active);
                if (active?.slug) this.setActiveSlug(active.slug);
            }));
            // The previous game has disposed its renderers before this event.
            // Keep only the selected character's hot pack after leaving Open World.
            this.unsubscribe.push(eventBus.on('game:launched', ({ gameId } = {}) => {
                if (gameId && gameId !== 'open-world') this.releaseInactivePacks();
            }));
            // Stop optional network traffic as soon as navigation away begins,
            // rather than waiting until the next game's assets are ready.
            this.unsubscribe.push(eventBus.on('game:loading', ({ gameId } = {}) => {
                if (gameId && gameId !== 'open-world') this.cancelBackgroundLoads();
            }));
        }
    }

    setActiveSlug(slug) {
        const normalized = String(slug ?? '').trim().toLowerCase();
        if (!BUILTIN_CHARACTER_SLUGS.includes(normalized)) return this.activeSlug;
        this.activeSlug = normalized;
        try {
            this.storage?.setItem?.(STORAGE_KEY, normalized);
        } catch {}
        return this.activeSlug;
    }

    rosterSlugs() {
        return [
            this.activeSlug,
            ...BUILTIN_CHARACTER_SLUGS.filter((slug) => slug !== this.activeSlug),
        ];
    }

    resolveSlug(actorId, { player = false, index = 0 } = {}) {
        const normalizedId = String(actorId ?? '').trim().toLowerCase();
        if (BUILTIN_CHARACTER_SLUGS.includes(normalizedId)) return normalizedId;
        if (player) return this.activeSlug;
        const roster = this.rosterSlugs().slice(1);
        return roster[Math.abs(Number(index) || 0) % Math.max(roster.length, 1)] ?? this.activeSlug;
    }

    runtimeVariant({ player = false } = {}) {
        const variants = characterRuntimeVariants(this.performanceProfile);
        return player ? variants.active : variants.npc;
    }

    async loadPack(slug, preferredVariant = this.runtimeVariant({ player: true }), { background = false } = {}) {
        if (this.disposed) throw new Error('Sprite service disposed');
        const normalizedSlug = BUILTIN_CHARACTER_SLUGS.includes(slug) ? slug : this.activeSlug;
        // A downloaded offline pack deliberately contains the small lite art.
        // Prefer it immediately when disconnected instead of retrying uncached
        // high-resolution PNGs and delaying an offline gameplay launch.
        const variants = orderedSpriteVariants(globalThis.navigator?.onLine === false
            ? 'lite' : normalizeSpriteVariant(preferredVariant));
        let lastError = null;

        for (const variant of variants) {
            const key = `${normalizedSlug}:${variant}`;
            const failure = this.failedPairs.get(key);
            if (failure && failure.retryAfter > Date.now()) { lastError = failure.error; continue; }
            if (this.packCache.has(key)) {
                const pack = this.packCache.get(key);
                this.packCache.delete(key);
                this.packCache.set(key, pack);
                this.counters.hits++;
                this.failedPairs.delete(key);
                return pack;
            }

            let pending = this.packPromises.get(key);
            let meta = this.pendingLoadMeta.get(key);
            // A foreground request joining an optional preload must make the
            // shared download critical, preventing a scene-change abort.
            if (pending && !background && meta) meta.background = false;
            // Never attach a new foreground request to an already cancelled task.
            if (pending && meta?.controller.signal.aborted) pending = null;
            if (!pending) {
                this.counters.misses++;
                const controller = new AbortController();
                meta = { controller, background };
                pending = this.loadGate.run(() => withTransientRetry(
                    () => this.loadPair(normalizedSlug, variant, {
                        signal: controller.signal, background: meta.background,
                    }),
                    {
                        signal: controller.signal,
                        attempts: 2,
                        onRetry: () => { this.counters.transientRetries++; },
                    },
                ));
                this.packPromises.set(key, pending);
                this.pendingLoadMeta.set(key, meta);
            }
            try {
                const pack = await pending;
                if (this.disposed) throw new Error('Sprite service disposed');
                // The cancelled optional request may have finished before its
                // browser decode was interrupted: never cache that stale result.
                if (meta?.controller.signal.aborted) throw abortedError();
                this.packCache.delete(key);
                this.packCache.set(key, pack);
                this.trimPackCache();
                this.failedPairs.delete(key);
                if (variant !== variants[0]) this.counters.fallbacks++;
                return pack;
            } catch (error) {
                if (this.disposed) throw new Error('Sprite service disposed');
                if (isAborted(error, meta?.controller.signal)) throw abortedError();
                lastError = error;
                this.counters.failedPairs++;
                this.failedPairs.set(key, { error, retryAfter: Date.now() + 30000 });
            } finally {
                if (this.packPromises.get(key) === pending) {
                    this.packPromises.delete(key);
                    this.pendingLoadMeta.delete(key);
                }
            }
        }
        throw lastError ?? new Error(`Character sprite pack could not be loaded for ${normalizedSlug}.`);
    }

    clearTransientFailures() {
        for (const [key, failure] of this.failedPairs) {
            if (isTransientAssetError(failure.error)) this.failedPairs.delete(key);
        }
    }

    cancelBackgroundLoads() {
        let cancelled = 0;
        for (const meta of this.pendingLoadMeta.values()) {
            if (!meta.background || meta.controller.signal.aborted) continue;
            meta.controller.abort();
            cancelled++;
        }
        this.counters.backgroundCancelled += cancelled;
        return cancelled;
    }

    trimPackCache() {
        const result = trimSpriteCache(this.packCache, this.cacheBudgetBytes);
        this.counters.evictions += result.evicted;
        return result;
    }

    releaseInactivePacks() {
        for (const key of [...this.packCache.keys()]) {
            if (key.startsWith(`${this.activeSlug}:`)) continue;
            this.packCache.delete(key);
            this.counters.evictions++;
        }
        this.trimPackCache();
    }

    memorySnapshot() {
        return {
            cacheBytesEstimated: cachedSpriteBytes(this.packCache),
            cacheBudgetBytes: this.cacheBudgetBytes,
            cacheEntries: this.packCache.size,
            overBudget: cachedSpriteBytes(this.packCache) > this.cacheBudgetBytes,
            inFlightPairs: this.packPromises.size,
            optionalInFlight: [...this.pendingLoadMeta.values()].filter(meta => meta.background).length,
            pendingControllers: this.controllers.size,
            loader: this.loadGate.snapshot(),
            ...this.counters,
            // Cached decoded pixels are an estimate, NOT process/GPU memory.
            evidenceType: 'decoded-image-strong-reference-estimate',
        };
    }

    async loadPair(slug, variant, { signal = null, background = false } = {}) {
        if (this.disposed || signal?.aborted) throw abortedError();
        const pair = builtinCharacterAssetPair(slug, variant);
        const controller = new AbortController();
        const onAbort = () => controller.abort();
        signal?.addEventListener('abort', onAbort, { once: true });
        if (signal?.aborted) controller.abort();
        this.controllers.add(controller);
        let timedOut = false;
        const timeout = globalThis.setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, LOAD_TIMEOUT_MS);
        try {
            const response = await fetch(pair.atlasUrl, {
                // Revalidate atlas JSON so its sprite_rev always matches the
                // matching PNG across atomic deployments; 304 remains cacheable.
                cache: 'no-cache',
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });
            if (!response.ok) {
                const error = new Error(`Atlas load failed (${response.status}) for ${slug}/${variant}.`);
                error.status = response.status;
                throw error;
            }
            const atlas = await response.json();
            if (controller.signal.aborted || this.disposed) throw abortedError();
            if (atlas?.meta?.artIntegrity === 'invalid') {
                throw new Error(`Character art integrity rejected for ${slug}/${variant}.`);
            }
            const spriteUrl = characterSpriteRevisionUrl(pair.spriteUrl, atlas);
            const image = await this.loadImage(spriteUrl, controller.signal, { background });
            if (controller.signal.aborted || this.disposed) throw abortedError();
            return Object.freeze({ slug, variant, atlas, image, ...pair, spriteUrl });
        } catch (error) {
            if (signal?.aborted || this.disposed) throw abortedError();
            if (timedOut) {
                const timeoutError = new Error(`Sprite download timed out for ${slug}/${variant}.`);
                timeoutError.code = 'TIMEOUT';
                throw timeoutError;
            }
            throw error;
        } finally {
            globalThis.clearTimeout(timeout);
            signal?.removeEventListener('abort', onAbort);
            this.controllers.delete(controller);
        }
    }

    loadImage(url, signal, { background = false } = {}) {
        return new Promise((resolve, reject) => {
            if (typeof Image === 'undefined') {
                reject(new Error('Image loading is unavailable in this runtime.'));
                return;
            }
            const image = new Image();
            let done = false;
            const finish = (callback, value) => {
                if (done) return;
                done = true;
                signal?.removeEventListener?.('abort', onAbort);
                image.onload = null;
                image.onerror = null;
                callback(value);
            };
            const onAbort = () => {
                finish(reject, new Error(`Sprite load aborted (${url})`));
                image.src = '';
            };
            image.decoding = 'async';
            // Progressive enhancement; ignored on engines without fetchPriority.
            image.fetchPriority = background ? 'low' : 'high';
            image.onload = () => {
                if (typeof image.decode !== 'function') { finish(resolve, image); return; }
                image.decode().then(() => finish(resolve, image),
                    () => finish(reject, new Error(`Sprite decode failed (${url})`)));
            };
            image.onerror = () => {
                const error = new Error(`Sprite load failed (${url})`);
                error.code = 'NETWORK_ERROR';
                finish(reject, error);
            };
            if (signal?.aborted) { onAbort(); return; }
            signal?.addEventListener?.('abort', onAbort, { once: true });
            image.src = url;
        });
    }

    async createCanvasAvatar(actorId, { player = false, index = 0, variant = null } = {}) {
        const slug = this.resolveSlug(actorId, { player, index });
        const pack = await this.loadPack(slug, variant ?? this.runtimeVariant({ player }));
        return new CanvasCharacterAvatar({
            slug,
            image: pack.image,
            atlas: pack.atlas,
            player,
        });
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.loadGate.dispose();
        for (const meta of this.pendingLoadMeta.values()) meta.controller.abort();
        this.pendingLoadMeta.clear();
        for (const controller of this.controllers) controller.abort();
        this.controllers.clear();
        globalThis.window?.removeEventListener?.('online', this.onOnline);
        this.unsubscribe.forEach((callback) => callback?.());
        this.unsubscribe = [];
        this.packPromises.clear();
        this.packCache.clear();
        this.failedPairs.clear();
    }
}
