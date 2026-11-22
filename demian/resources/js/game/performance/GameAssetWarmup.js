import { optionalAssetPolicy } from '../characters/runtime/MobileNetworkPolicy.js';

/**
 * Only preload a sprite that is required before a game's first playable frame.
 * The same CharacterVisualService single-flight cache is used by real launches.
 * No NPCs, score APIs, save-state or world tiles are prefetched.
 */
export function criticalSpriteSlug(gameId, visuals) {
    if (!visuals) return null;
    return ['open-world', 'dino-run', 'after-hours', 'cafe-rush'].includes(gameId)
        ? visuals.activeSlug ?? null : null;
}

export function criticalSpriteVariant() {
    return 'lite';
}

export function prewarmCriticalGameSprite(gameId, visuals, { networkPolicy = optionalAssetPolicy } = {}) {
    if (!visuals?.loadPack || networkPolicy()?.reason !== 'normal') return Promise.resolve(false);
    const slug = criticalSpriteSlug(gameId, visuals);
    if (!slug) return Promise.resolve(false);
    const variant = criticalSpriteVariant(gameId, visuals);
    // A failed background warmup must never change normal game startup.
    return Promise.resolve()
        .then(() => visuals.loadPack(slug, variant, { background: true, speculative: true }))
        .then(() => true, () => false);
}
