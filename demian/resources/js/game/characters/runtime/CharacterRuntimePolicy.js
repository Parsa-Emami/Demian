export const CHARACTER_ASSET_TIMEOUT_MS = 6500;

export function characterRuntimeVariants(performanceProfile = null) {
    const tier = performanceProfile?.tier ?? 'balanced';

    return Object.freeze({
        active: tier === 'performance' ? 'compact' : 'mobile',
        npc: 'compact',
    });
}

export function orderedSpriteVariants(preferred = 'mobile') {
    return [...new Set([preferred, 'mobile', 'compact', 'desktop'])];
}
