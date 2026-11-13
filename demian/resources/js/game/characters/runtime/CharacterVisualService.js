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
        this.packCache = new Map();
        this.failedPairs = new Map();
        this.controllers = new Set();
        this.disposed = false;
        this.cacheBudgetBytes = spriteCacheBudgetBytes(performanceProfile);
        this.loadGate = new SpriteLoadGate(performanceProfile?.tier === 'performance' ? 1 : 2);
        this.counters = { hits: 0, misses: 0, fallbacks: 0, evictions: 0, failedPairs: 0 };
        this.unsubscribe = [];

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

    async loadPack(slug, preferredVariant = this.runtimeVariant({ player: true })) {
        if (this.disposed) throw new Error('Sprite service disposed');
        const normalizedSlug = BUILTIN_CHARACTER_SLUGS.includes(slug) ? slug : this.activeSlug;
        const variants = orderedSpriteVariants(normalizeSpriteVariant(preferredVariant));
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
            if (!pending) {
                this.counters.misses++;
                pending = this.loadGate.run(() => this.loadPair(normalizedSlug, variant));
                this.packPromises.set(key, pending);
            }
            try {
                const pack = await pending;
                // A queued image decode must not repopulate caches after disposal.
                if (this.disposed) throw new Error('Sprite service disposed');
                this.packCache.delete(key);
                this.packCache.set(key, pack);
                this.trimPackCache();
                this.failedPairs.delete(key);
                if (variant !== variants[0]) this.counters.fallbacks++;
                return pack;
            } catch (error) {
                if (this.disposed) throw new Error('Sprite service disposed');
                lastError = error;
                this.counters.failedPairs++;
                this.failedPairs.set(key, { error, retryAfter: Date.now() + 30000 });
            } finally {
                if (this.packPromises.get(key) === pending) this.packPromises.delete(key);
            }
        }

        throw lastError ?? new Error(`Character sprite pack could not be loaded for ${normalizedSlug}.`);
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
            pendingControllers: this.controllers.size,
            loader: this.loadGate.snapshot(),
            ...this.counters,
            // Cached decoded pixels are an estimate, NOT process/GPU memory.
            evidenceType: 'decoded-image-strong-reference-estimate',
        };
    }

    async loadPair(slug, variant) {
        if (this.disposed) throw new Error('Sprite service disposed');
        const pair = builtinCharacterAssetPair(slug, variant);
        const controller = new AbortController();
        this.controllers.add(controller);
        const timeout = globalThis.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
        try {
            const response = await fetch(pair.atlasUrl, {
                cache: 'no-cache',
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`Atlas load failed (${response.status}) for ${slug}/${variant}.`);
            }
            const atlas = await response.json();
            if (controller.signal.aborted || this.disposed) throw new Error('Sprite load aborted');
            if (atlas?.meta?.artIntegrity === 'invalid') {
                throw new Error(`Character art integrity rejected for ${slug}/${variant}.`);
            }
            const spriteUrl = characterSpriteRevisionUrl(pair.spriteUrl, atlas);
            const image = await this.loadImage(spriteUrl, controller.signal);
            if (controller.signal.aborted || this.disposed) throw new Error('Sprite load aborted');
            return Object.freeze({ slug, variant, atlas, image, ...pair, spriteUrl });
        } finally {
            globalThis.clearTimeout(timeout);
            this.controllers.delete(controller);
        }
    }

    loadImage(url, signal) {
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
            image.onload = () => {
                if (typeof image.decode !== 'function') { finish(resolve, image); return; }
                image.decode().then(() => finish(resolve, image),
                    () => finish(reject, new Error(`Sprite decode failed (${url})`)));
            };
            image.onerror = () => finish(reject, new Error(`Sprite load failed (${url})`));
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
        for (const controller of this.controllers) controller.abort();
        this.controllers.clear();
        this.unsubscribe.forEach((callback) => callback?.());
        this.unsubscribe = [];
        this.packPromises.clear();
        this.packCache.clear();
        this.failedPairs.clear();
    }
}
