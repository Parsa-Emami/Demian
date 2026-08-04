import { CAFE_BOUNDS, CAFE_STATIC_COLLIDERS } from '../shared/cafe/CafeReferenceLayout.js';

export const OPEN_WORLD_DISTRICTS = Object.freeze([
    Object.freeze({ id: 'cafe-entrance', x: -12, z: 12, radius: 7, label: 'CAFÉ ENTRANCE' }),
    Object.freeze({ id: 'cafe-counter', x: 12, z: 6, radius: 7, label: 'CAFÉ COUNTER' }),
    Object.freeze({ id: 'cafe-lounge', x: -12, z: -7, radius: 7, label: 'CAFÉ LOUNGE' }),
    Object.freeze({ id: 'cafe-gallery', x: 10, z: -7, radius: 7, label: 'CAFÉ GALLERY' }),
]);

const CABINET_GAMES = Object.freeze(['tetris', 'hide-and-seek', 'event', 'role-play', 'open-world']);
const CABINET_ANCHORS = Object.freeze([
    [-3.8, 14.4], [3.8, 14.4], [5.2, 10.8], [7.0, 8.0],
    [7.5, 3.6], [6.8, -5.5], [2.0, -7.8], [-2.0, -7.8],
    [-4.8, -4.0], [-4.8, 3.2], [0.0, 5.2], [1.0, 10.6],
    [18.8, -11.8], [17.0, -14.0],
]);
const CAFE_ACCENTS = Object.freeze(['#d6a35c', '#3f9d7d', '#8b6f62', '#b78b54']);

export function createCabinetDefinitions(decorDensity = 0.8) {
    const requested = Math.max(1, Math.round(18 * Number(decorDensity || 0.8)));
    const count = Math.min(CABINET_ANCHORS.length, requested);
    return Object.freeze(CABINET_ANCHORS.slice(0, count).map(([x, z], index) => {
        const district = OPEN_WORLD_DISTRICTS[index % OPEN_WORLD_DISTRICTS.length];
        return Object.freeze({
            id: `cafe-cabinet-${String(index + 1).padStart(2, '0')}`,
            index,
            x,
            z,
            districtId: district.id,
            label: ['PLAY', 'CAFE', 'STORY', 'GAME'][index % 4],
            accent: CAFE_ACCENTS[index % CAFE_ACCENTS.length],
            gameId: CABINET_GAMES[index % CABINET_GAMES.length],
            collider: Object.freeze({ halfExtents: Object.freeze({ x: 0.72, z: 0.52 }) }),
            interaction: Object.freeze({ x, z: z + 1.15, radius: 2.15 }),
        });
    }));
}

export function createOpenWorldCollisionManifest(cabinets = []) {
    return Object.freeze({
        bounds: CAFE_BOUNDS,
        staticColliders: Object.freeze([
            ...CAFE_STATIC_COLLIDERS,
            ...cabinets.map((cabinet) => Object.freeze({
                id: cabinet.id,
                position: Object.freeze({ x: cabinet.x, z: cabinet.z }),
                halfExtents: cabinet.collider.halfExtents,
                metadata: Object.freeze({ kind: 'cafe-game-station', gameId: cabinet.gameId }),
            })),
        ]),
        triggers: Object.freeze(OPEN_WORLD_DISTRICTS.map((district) => Object.freeze({
            id: `district-${district.id}`,
            position: Object.freeze({ x: district.x, z: district.z }),
            radius: district.radius,
            metadata: Object.freeze({ kind: 'cafe-district', districtId: district.id, label: district.label }),
        }))),
    });
}
