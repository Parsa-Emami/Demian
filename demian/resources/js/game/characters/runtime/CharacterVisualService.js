import CanvasCharacterAvatar from '../CanvasCharacterAvatar.js';
import {
    BUILTIN_CHARACTER_SLUGS,
    DEFAULT_ACTIVE_SLUG,
    builtinCharacterAssetPair,
    normalizeSpriteVariant,
} from '../CharacterVisualContract.js';
import { orderedSpriteVariants, characterRuntimeVariants, CHARACTER_ASSET_TIMEOUT_MS } from './CharacterRuntimePolicy.js';

const STORAGE_KEY = 'demian.character.slug.v1';
const LOAD_TIMEOUT_MS = CHARACTER_ASSET_TIMEOUT_MS;
const PACK_CACHE_BUDGET = 24 * 1024 * 1024;

function packBytes(pack) {
    const width = pack.image?.naturalWidth || pack.image?.width || pack.atlas?.meta?.size?.w || 0;
    const height = pack.image?.naturalHeight || pack.image?.height || pack.atlas?.meta?.size?.h || 0;
    return width * height * 4;
}

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
        this.unsubscribe = [];

        if (eventBus?.on) {
            this.unsubscribe.push(eventBus.on('character:selected', ({ record } = {}) => {
                this.setActiveSlug(record?.slug);
            }));
            this.unsubscribe.push(eventBus.on('characters:changed', (characters = []) => {
                const active = characters.find((character) => character?.is_active);
                if (active?.slug) this.setActiveSlug(active.slug);
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
                this.failedPairs.delete(key);
                return pack;
            }
            try {
                let pending = this.packPromises.get(key);
                if (!pending) {
                    pending = this.loadPair(normalizedSlug, variant);
                    this.packPromises.set(key, pending);
                }
                const pack = await pending;
                this.packCache.set(key, pack);
                this.trimPackCache();
                if (this.packPromises.get(key) === pending) this.packPromises.delete(key);
                return pack;
            } catch (error) {
                this.packPromises.delete(key);
                lastError = error;
                this.failedPairs.set(key, { error, retryAfter: Date.now() + 30000 });
            }
        }

        throw lastError ?? new Error(`Character sprite pack could not be loaded for ${normalizedSlug}.`);
    }

    trimPackCache() {
        let bytes = [...this.packCache.values()].reduce((sum, pack) => sum + packBytes(pack), 0);
        for (const [key, pack] of this.packCache) {
            if (bytes <= PACK_CACHE_BUDGET || this.packCache.size <= 1) break;
            this.packCache.delete(key);
            bytes -= packBytes(pack);
            // Existing avatars keep their image. Dropping this cache reference
            // permits collection after the last game using that image exits.
        }
    }

    async loadPair(slug, variant) {
        const pair = builtinCharacterAssetPair(slug, variant);
        const controller = new AbortController();
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
            if (atlas?.meta?.artIntegrity === 'invalid') {
                throw new Error(`Character art integrity rejected for ${slug}/${variant}.`);
            }
            const image = await this.loadImage(pair.spriteUrl, controller.signal);
            return Object.freeze({ slug, variant, atlas, image, ...pair });
        } finally {
            globalThis.clearTimeout(timeout);
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
        this.unsubscribe.forEach((callback) => callback?.());
        this.unsubscribe = [];
        this.packPromises.clear();
        this.packCache.clear();
        this.failedPairs.clear();
    }
}
