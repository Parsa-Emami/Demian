const freezePoint = (x, z) => Object.freeze({ x, z });

export const CAFE_HIDE_MAP = Object.freeze({
    id: 'cafe-hide-map-v1',
    title: 'Café Demian After Hours',
    bounds: Object.freeze({ minX: -22, maxX: 22, minZ: -14, maxZ: 14 }),
    floor: Object.freeze({ width: 44, depth: 28, color: 0x080b18 }),
    playerSpawn: freezePoint(-17, 9),
    seekerSpawn: freezePoint(17, -9),
    hiderSpawns: Object.freeze([
        freezePoint(-15, 8),
        freezePoint(-12, -9),
        freezePoint(12, 9),
    ]),
    patrolPoints: Object.freeze([
        freezePoint(16, -9), freezePoint(15, 9), freezePoint(2, 10), freezePoint(-14, 8),
        freezePoint(-15, -8), freezePoint(0, -10), freezePoint(12, -7), freezePoint(0, 1),
    ]),
    staticColliders: Object.freeze([
        Object.freeze({ id: 'wall-north', position: freezePoint(0, -14), halfExtents: freezePoint(22, 0.45), height: 2.7, color: 0x1b2542 }),
        Object.freeze({ id: 'wall-south', position: freezePoint(0, 14), halfExtents: freezePoint(22, 0.45), height: 2.7, color: 0x1b2542 }),
        Object.freeze({ id: 'wall-west', position: freezePoint(-22, 0), halfExtents: freezePoint(0.45, 14), height: 2.7, color: 0x1b2542 }),
        Object.freeze({ id: 'wall-east', position: freezePoint(22, 0), halfExtents: freezePoint(0.45, 14), height: 2.7, color: 0x1b2542 }),
        Object.freeze({ id: 'counter', position: freezePoint(-5, -8), halfExtents: freezePoint(5.2, 1.25), height: 1.25, color: 0x40204f }),
        Object.freeze({ id: 'shelf-west', position: freezePoint(-16, -2), halfExtents: freezePoint(1.1, 4.2), height: 2.2, color: 0x193d46 }),
        Object.freeze({ id: 'shelf-east', position: freezePoint(16, 3), halfExtents: freezePoint(1.1, 4.3), height: 2.2, color: 0x3d2146 }),
        Object.freeze({ id: 'center-divider-a', position: freezePoint(0, -4.6), halfExtents: freezePoint(0.55, 3.4), height: 2.5, color: 0x1c2f50 }),
        Object.freeze({ id: 'center-divider-b', position: freezePoint(0, 6.2), halfExtents: freezePoint(0.55, 3.1), height: 2.5, color: 0x1c2f50 }),
        Object.freeze({ id: 'table-nw', position: freezePoint(-10, 3.5), halfExtents: freezePoint(2.0, 1.4), height: 0.9, color: 0x5b3348 }),
        Object.freeze({ id: 'table-ne', position: freezePoint(9.5, -4), halfExtents: freezePoint(2.1, 1.4), height: 0.9, color: 0x334f5b }),
        Object.freeze({ id: 'arcade-row', position: freezePoint(8, 9.8), halfExtents: freezePoint(5.5, 0.9), height: 2.1, color: 0x223269 }),
        Object.freeze({ id: 'plant-island', position: freezePoint(7, 3.5), halfExtents: freezePoint(1.4, 1.4), height: 1.6, color: 0x184d3a }),
    ]),
    hideSpots: Object.freeze([
        Object.freeze({ id: 'behind-counter', label: 'پشت پیشخوان', position: freezePoint(-6.5, -10.7), exitPosition: freezePoint(-6.5, -9.6), radius: 1.45, capacity: 1, concealment: 0.94, color: 0xf472b6 }),
        Object.freeze({ id: 'west-shelf', label: 'کنار قفسه غربی', position: freezePoint(-18.4, -2.2), exitPosition: freezePoint(-17.2, -2.2), radius: 1.25, capacity: 1, concealment: 0.9, color: 0x22d3ee }),
        Object.freeze({ id: 'east-shelf', label: 'کنار قفسه شرقی', position: freezePoint(18.4, 3.2), exitPosition: freezePoint(17.1, 3.2), radius: 1.25, capacity: 1, concealment: 0.9, color: 0xa78bfa }),
        Object.freeze({ id: 'hide-table-nw', label: 'زیر میز شمال‌غربی', position: freezePoint(-10, 3.5), exitPosition: freezePoint(-10, 5.2), radius: 1.15, capacity: 1, concealment: 0.82, color: 0xfb7185 }),
        Object.freeze({ id: 'hide-table-ne', label: 'زیر میز شمال‌شرقی', position: freezePoint(9.5, -4), exitPosition: freezePoint(9.5, -2.2), radius: 1.15, capacity: 1, concealment: 0.82, color: 0x67e8f9 }),
        Object.freeze({ id: 'arcade-shadow', label: 'پشت دستگاه‌های آرکید', position: freezePoint(8, 12), exitPosition: freezePoint(8, 10.9), radius: 1.35, capacity: 1, concealment: 0.92, color: 0xc084fc }),
        Object.freeze({ id: 'hide-plant-island', label: 'میان گیاهان', position: freezePoint(7, 3.5), exitPosition: freezePoint(5.4, 3.5), radius: 1.1, capacity: 1, concealment: 0.78, color: 0x34d399 }),
        Object.freeze({ id: 'south-corner', label: 'گوشه‌ی جنوبی', position: freezePoint(-18.8, 11.1), exitPosition: freezePoint(-17.1, 10.2), radius: 1.25, capacity: 1, concealment: 0.86, color: 0xfbbf24 }),
    ]),
    lightZones: Object.freeze([
        Object.freeze({ id: 'bright-center', position: freezePoint(0, 0), radius: 7, lightLevel: 1 }),
        Object.freeze({ id: 'dim-west', position: freezePoint(-17, 0), radius: 7, lightLevel: 0.45 }),
        Object.freeze({ id: 'dim-east', position: freezePoint(17, 5), radius: 6, lightLevel: 0.38 }),
    ]),
});

export function validateCafeHideMap(map = CAFE_HIDE_MAP) {
    const ids = new Set();
    for (const entry of [...map.staticColliders, ...map.hideSpots]) {
        if (!entry.id || ids.has(entry.id)) return false;
        ids.add(entry.id);
    }
    return map.bounds.minX < map.bounds.maxX && map.bounds.minZ < map.bounds.maxZ && map.hideSpots.length >= 4;
}
