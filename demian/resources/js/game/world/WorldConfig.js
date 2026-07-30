export const WORLD_CONFIG = Object.freeze({
    width: 92,
    depth: 54,
    bounds: Object.freeze({
        x: 43.5,
        z: 24.5,
    }),
    characterDisplay: Object.freeze({
        worldWidth: 3.75,
        worldHeight: 3.75,
    }),
    camera: Object.freeze({
        desktopOverviewSpan: 36,
        mobileOverviewSpan: 25,
        desktopFollowSpan: 11.2,
        mobileFollowSpan: 9.2,
    }),
    spawnPoints: Object.freeze([
        Object.freeze({ x: 0, z: 2 }),
        Object.freeze({ x: -10, z: -4 }),
        Object.freeze({ x: 11, z: 4 }),
        Object.freeze({ x: -20, z: 8 }),
        Object.freeze({ x: 21, z: -7 }),
        Object.freeze({ x: -30, z: -12 }),
        Object.freeze({ x: 31, z: 11 }),
    ]),
});

export function randomWorldPoint(margin = 4, random = Math.random) {
    const xLimit = Math.max(1, WORLD_CONFIG.bounds.x - margin);
    const zLimit = Math.max(1, WORLD_CONFIG.bounds.z - margin);

    return {
        x: (random() * 2 - 1) * xLimit,
        z: (random() * 2 - 1) * zLimit,
    };
}
