export const CHARACTER_ASSET_TIMEOUT_MS = 12000;

export function characterRuntimeVariants(performanceProfile = null) {
    const tier = performanceProfile?.tier ?? 'balanced';

    return Object.freeze({
        active: tier === 'high' ? 'detail' : tier === 'performance' ? 'lite' : 'runtime',
        npc: 'lite',
    });
}

export function orderedSpriteVariants(preferred = 'runtime') {
    // A failed small sheet must not escalate into a 53 MiB desktop allocation.
    return [...new Set(preferred === 'detail'
        ? ['detail', 'runtime', 'lite', 'compact', 'mobile']
        : [preferred, 'lite', 'runtime', 'compact', 'mobile'])];
}
