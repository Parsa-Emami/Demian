import CanvasCharacterAvatar from '../CanvasCharacterAvatar.js';
import {
    BUILTIN_CHARACTER_SLUGS,
    builtinCharacterAssetPair,
    normalizeSpriteVariant,
} from '../CharacterVisualContract.js';
import { orderedSpriteVariants } from './CharacterRuntimePolicy.js';

const STORAGE_KEY = 'demian.character.slug.v1';
const LOAD_TIMEOUT_MS = 7000;

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
        this.activeSlug = readStoredSlug(storage) ?? 'tiam';
        this.packPromises = new Map();
        this.packCache = new Map();
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
        const tier = this.performanceProfile?.tier ?? 'balanced';
        if (player) return tier === 'performance' ? 'compact' : 'mobile';
        return 'compact';
    }

    async loadPack(slug, preferredVariant = 'mobile') {
        const normalizedSlug = BUILTIN_CHARACTER_SLUGS.includes(slug) ? slug : this.activeSlug;
        const variants = orderedSpriteVariants(normalizeSpriteVariant(preferredVariant));
        let lastError = null;

        for (const variant of variants) {
            const key = `${normalizedSlug}:${variant}`;
            if (this.packCache.has(key)) return this.packCache.get(key);
            try {
                let pending = this.packPromises.get(key);
                if (!pending) {
                    pending = this.loadPair(normalizedSlug, variant);
                    this.packPromises.set(key, pending);
                }
                const pack = await pending;
                this.packCache.set(key, pack);
                this.packPromises.delete(key);
                return pack;
            } catch (error) {
                this.packPromises.delete(key);
                lastError = error;
            }
        }

        throw lastError ?? new Error(`Character sprite pack could not be loaded for ${normalizedSlug}.`);
    }

    async loadPair(slug, variant) {
        const pair = builtinCharacterAssetPair(slug, variant);
        const controller = new AbortController();
        const timeout = globalThis.setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);
        try {
            const response = await fetch(pair.atlasUrl, {
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
            const onAbort = () => finish(reject, new Error(`Sprite load aborted (${url})`));
            image.decoding = 'async';
            image.onload = () => finish(resolve, image);
            image.onerror = () => finish(reject, new Error(`Sprite load failed (${url})`));
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
    }
}
