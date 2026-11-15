export const CHARACTER_ASSET_TIMEOUT_MS = 12000;

export function characterRuntimeVariants(performanceProfile = null, { coarsePointer =
    globalThis.matchMedia?.('(pointer: coarse)')?.matches === true ||
    (Number(globalThis.navigator?.maxTouchPoints) || 0) > 0 } = {}) {
    const tier = performanceProfile?.tier ?? 'balanced';
    // A powerful phone is not necessarily on a fast network. iOS Safari
    // does not expose Network Information API, so a high GPU score must not
    // trigger a multi-megabyte detail download on the critical launch path.
    return Object.freeze({
        active: coarsePointer || tier === 'performance'
            ? 'lite' : tier === 'high' ? 'detail' : 'runtime',
        npc: 'lite',
    });
}

export function orderedSpriteVariants(preferred = 'runtime') {
    // A failed small sheet must not escalate into a 53 MiB desktop allocation.
    return [...new Set(preferred === 'detail'
        ? ['detail', 'runtime', 'lite', 'compact', 'mobile']
        : [preferred, 'lite', 'runtime', 'compact', 'mobile'])];
}
