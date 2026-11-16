import { optionalAssetPolicy } from '../characters/runtime/MobileNetworkPolicy.js';

/**
 * Only preload a sprite that is required before a game's first playable frame.
 * The same CharacterVisualService single-flight cache is used by real launches.
 * No NPCs, score APIs, save-state or world tiles are prefetched.
 */
export function criticalSpriteSlug(gameId, visuals) {
    if (!visuals) return null;
    if (gameId === 'cafe-rush') return 'amirreza';
    if (gameId === 'after-hours') return 'darya';
    if (gameId === 'open-world' || gameId === 'dino-run') return visuals.activeSlug ?? null;
    return null;
}

export function prewarmCriticalGameSprite(gameId, visuals, { networkPolicy = optionalAssetPolicy } = {}) {
    if (!visuals?.loadPack || networkPolicy()?.reason !== 'normal') return Promise.resolve(false);
    const slug = criticalSpriteSlug(gameId, visuals);
    if (!slug) return Promise.resolve(false);
    const variant = visuals.runtimeVariant?.({ player: true }) ?? 'lite';
    // A failed background warmup must never change normal game startup.
    return Promise.resolve()
        .then(() => visuals.loadPack(slug, variant, { background: true }))
        .then(() => true, () => false);
}
