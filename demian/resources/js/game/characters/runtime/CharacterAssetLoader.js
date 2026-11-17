import * as THREE from 'three';
import { CHARACTER_ASSET_TIMEOUT_MS, orderedSpriteVariants } from './CharacterRuntimePolicy.js';
import { BUILTIN_CHARACTER_SLUGS, builtinCharacterAssetPair, characterSpriteRevisionUrl } from '../CharacterVisualContract.js';

const BUILTIN_SLUGS = new Set(BUILTIN_CHARACTER_SLUGS);

export default class CharacterAssetLoader {
    constructor({ visualService = null, activeVariant = 'lite', textureLoader = new THREE.TextureLoader(),
        fetcher = globalThis.fetch?.bind(globalThis), timeoutMs = CHARACTER_ASSET_TIMEOUT_MS } = {}) {
        this.visualService = visualService;
        this.runtimeVariants = { active: activeVariant };
        this.textureLoader = textureLoader;
        this.assetPromises = new Map();
        this.fetcher = fetcher;
        this.timeoutMs = timeoutMs;
    }
    characterAssetPairs(record, preferredVariant = this.runtimeVariants.active) {
        const pairs = [];
        const seen = new Set();
        const add = (spriteUrl, atlasUrl, variant = null) => {
            if (!spriteUrl || !atlasUrl) {
                return;
            }

            const key = `${spriteUrl}::${atlasUrl}`;
            if (seen.has(key)) {
                return;
            }

            seen.add(key);
            pairs.push({ spriteUrl, atlasUrl, variant });
        };

        if (BUILTIN_SLUGS.has(record.slug)) {
            orderedSpriteVariants(preferredVariant).forEach((variant) => {
                const pair = builtinCharacterAssetPair(record.slug, variant);
                add(pair.spriteUrl, pair.atlasUrl, pair.variant);
            });

        } else {
            add(record.sprite_url, record.atlas_url, 'custom');
        }

        return pairs;
    }

    createFallbackCharacterAssets(record) {
        const canvas = document.createElement('canvas');
        canvas.width = 48;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        const accent = {
            ainaz: '#e9d9b6',
            amirreza: '#fbbf24',
            parsa: '#ef4444',
            darya: '#fb7185',
            iman: '#f59e0b',
            uzudi: '#8b5cf6',
            setayesh: '#f43f5e',
            negar: '#e6bc45',
            hanna: '#d6ab67',
        }[record.slug] ?? '#a78bfa';

        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = 'rgba(0, 0, 0, 0.28)';
        context.fillRect(10, 59, 28, 3);
        context.fillStyle = record.slug === 'parsa' ? '#171717' : accent;
        context.fillRect(14, 31, 20, 22);
        context.fillStyle = '#202020';
        context.fillRect(15, 50, 8, 10);
        context.fillRect(27, 50, 8, 10);
        context.fillStyle = '#d89b6e';
        context.fillRect(14, 15, 20, 18);
        context.fillStyle = '#191716';
        context.fillRect(12, 11, 24, 9);
        context.fillRect(13, 8, 20, 6);

        if (record.slug === 'parsa') {
            context.fillStyle = '#111827';
            context.fillRect(15, 21, 8, 5);
            context.fillRect(26, 21, 8, 5);
            context.fillRect(23, 22, 3, 2);
            context.fillStyle = '#2a1b17';
            context.fillRect(16, 28, 17, 5);
            context.fillRect(20, 33, 10, 3);
            context.save();
            context.translate(31, 42);
            context.rotate(-0.48);
            context.fillStyle = '#b91c1c';
            context.fillRect(-5, -3, 19, 8);
            context.fillStyle = '#ef4444';
            context.fillRect(-1, -1, 8, 4);
            context.fillStyle = '#3f3f46';
            context.fillRect(12, 0, 13, 2);
            context.restore();
        } else {
            context.fillStyle = '#f8fafc';
            context.fillRect(28, 21, 3, 3);
            context.fillStyle = accent;
            context.fillRect(11, 35, 4, 12);
            context.fillRect(34, 35, 4, 12);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        const frame = Object.freeze({ x: 0, y: 0, w: 48, h: 64 });
        const animation = Object.freeze({ frames: Object.freeze(['fallback']), fps: 1, loop: true });
        const atlas = Object.freeze({
            meta: Object.freeze({ size: Object.freeze({ w: 48, h: 64 }), generatedFallback: true }),
            pivot: Object.freeze({ x: 0.5, y: 0.95 }),
            display: Object.freeze({ worldWidth: 3.75, worldHeight: 3.75 }),
            render: Object.freeze({ referenceBodyWidthRatio: 0.68, referenceBodyHeightRatio: 0.86 }),
            frames: Object.freeze({ fallback: frame }),
            animations: Object.freeze({
                idle: animation,
                walk: animation,
                run: animation,
                jump: animation,
                win: animation,
            }),
            fallbacks: Object.freeze({
                breathe: 'idle', blink: 'idle', ready: 'idle', tiptoe: 'walk',
                sprint: 'run', skid: 'run', turn: 'walk', takeoff: 'jump',
                hop: 'jump', fall: 'jump', land: 'jump', slide: 'run',
                celebrate: 'win', salute: 'win', hover: 'jump', guitar: 'win',
                guitar_loop: 'win', dance: 'win', wave: 'win', pose: 'win',
                sleep: 'idle', taunt: 'win', dodge: 'run', crouch: 'idle',
                laugh: 'win', spin: 'win', dash: 'run',
            }),
        });

        return { texture, atlas, spriteUrl: null, atlasUrl: null, fallback: true };
    }

    async loadCharacterAssets(record, {
        preferredVariant = this.runtimeVariants.active, background = false,
    } = {}) {
        if (this.visualService && BUILTIN_SLUGS.has(record.slug)) {
            const pack = await this.visualService.loadPack(record.slug, preferredVariant, { background });
            const texture = new THREE.Texture(pack.image);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.magFilter = THREE.NearestFilter;
            texture.minFilter = THREE.NearestFilter;
            texture.generateMipmaps = false;
            texture.needsUpdate = true;
            return { texture, atlas: pack.atlas, spriteUrl: pack.spriteUrl,
                atlasUrl: pack.atlasUrl, variant: pack.variant };
        }
        const failures = [];

        for (const pair of this.characterAssetPairs(record, preferredVariant)) {
            try {
                const key = `${pair.atlasUrl}::${pair.spriteUrl}`;
                let pending = this.assetPromises.get(key);
                if (!pending) {
                    pending = this.loadAssetPair(pair);
                    this.assetPromises.set(key, pending);
                }
                try {
                    return await pending;
                } finally {
                    if (this.assetPromises.get(key) === pending) {
                        this.assetPromises.delete(key);
                    }
                }
            } catch (error) {
                failures.push(error);
                console.warn('Character asset pair failed; trying fallback.', {
                    slug: record.slug,
                    spriteUrl: pair.spriteUrl,
                    atlasUrl: pair.atlasUrl,
                    error,
                });
            }
        }

        const reason = failures.at(-1)?.message ?? 'unknown asset error';
        throw new Error(`Character assets could not be loaded for ${record.slug}: ${reason}`);
    }

    async loadAssetPair(pair) {
        const atlas = await this.loadJson(pair.atlasUrl);
        if (atlas?.meta?.artIntegrity === 'invalid') {
            throw new Error(`Character art failed integrity validation (${pair.atlasUrl})`);
        }
        const atlasImage = atlas?.meta?.image;
        const imageUrl = atlasImage
            ? new URL(atlasImage, pair.atlasUrl).toString()
            : pair.spriteUrl;
        const spriteUrl = characterSpriteRevisionUrl(imageUrl, atlas);
        const texture = await this.loadTexture(spriteUrl);
        return { texture, atlas, spriteUrl, atlasUrl: pair.atlasUrl, variant: pair.variant };
    }

    async loadJson(url) {
        const controller = new AbortController();
        const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetcher(url, {
                cache: 'no-cache',
                headers: { Accept: 'application/json' },
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`Atlas load failed: ${response.status} (${url})`);
            }

            return await response.json();
        } catch (error) {
            if (error?.name === 'AbortError') {
                throw new Error(`Atlas load timed out (${url})`);
            }
            throw error;
        } finally {
            globalThis.clearTimeout(timeout);
        }
    }

    loadTexture(url) {
        return new Promise((resolve, reject) => {
            let settled = false;
            const finish = (callback, value) => {
                if (settled) return;
                settled = true;
                globalThis.clearTimeout(timeout);
                callback(value);
            };
            const timeout = globalThis.setTimeout(
                () => finish(reject, new Error(`Sprite Sheet load timed out (${url})`)),
                this.timeoutMs
            );

            this.textureLoader.load(
                url,
                (texture) => {
                    if (settled) {
                        texture.dispose();
                        return;
                    }
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.magFilter = THREE.NearestFilter;
                    texture.minFilter = THREE.NearestFilter;
                    texture.generateMipmaps = false;
                    finish(resolve, texture);
                },
                undefined,
                () => finish(reject, new Error(`Sprite Sheet load failed (${url})`))
            );
        });
    }

    dispose() {
        this.assetPromises.clear();
    }
}
