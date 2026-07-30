import { WORLD_CONFIG } from './WorldConfig.js';

export const OPEN_WORLD_DISTRICTS = Object.freeze([
    Object.freeze({ id: 'neon-bay', x: -28, z: -3, radius: 5.5, label: 'NEON BAY' }),
    Object.freeze({ id: 'demian-core', x: 0, z: 3, radius: 5.5, label: 'DEMIAN CORE' }),
    Object.freeze({ id: 'turbo-lane', x: 28, z: -2, radius: 5.5, label: 'TURBO LANE' }),
]);

const CABINET_GAMES = Object.freeze([
    'tetris',
    'hide-and-seek',
    'event',
    'role-play',
    'open-world',
]);

export function createCabinetDefinitions(decorDensity = 0.8) {
    const count = Math.max(8, Math.round(18 * Number(decorDensity || 0.8)));
    const labels = ['PLAY', 'JUMP', 'DASH', 'RUN', 'WIN', 'COMBO'];
    const accentValues = ['#ff4fd8', '#8b5cf6', '#22d3ee', '#fbbf24'];
    const definitions = [];

    for (let index = 0; index < count; index += 1) {
        const district = OPEN_WORLD_DISTRICTS[index % OPEN_WORLD_DISTRICTS.length];
        const side = index % 2 === 0 ? -1 : 1;
        const row = Math.floor(index / 2) % 3;
        const x = district.x + side * (7.2 + row * 2.5);
        const z = district.z - 7 + row * 5.8;
        definitions.push(Object.freeze({
            id: `cabinet-${String(index + 1).padStart(2, '0')}`,
            index,
            x,
            z,
            districtId: district.id,
            label: labels[index % labels.length],
            accent: accentValues[index % accentValues.length],
            gameId: CABINET_GAMES[index % CABINET_GAMES.length],
            collider: Object.freeze({ halfExtents: Object.freeze({ x: 0.82, z: 0.58 }) }),
            interaction: Object.freeze({
                x,
                z: z + 1.18,
                radius: 2.25,
            }),
        }));
    }

    return Object.freeze(definitions);
}

export function createOpenWorldCollisionManifest(cabinets) {
    const edgeThickness = 0.55;
    return Object.freeze({
        staticColliders: Object.freeze([
            Object.freeze({
                id: 'boundary-north',
                position: Object.freeze({ x: 0, z: -WORLD_CONFIG.bounds.z - edgeThickness / 2 }),
                halfExtents: Object.freeze({ x: WORLD_CONFIG.bounds.x + 1, z: edgeThickness / 2 }),
                metadata: Object.freeze({ kind: 'boundary' }),
            }),
            Object.freeze({
                id: 'boundary-south',
                position: Object.freeze({ x: 0, z: WORLD_CONFIG.bounds.z + edgeThickness / 2 }),
                halfExtents: Object.freeze({ x: WORLD_CONFIG.bounds.x + 1, z: edgeThickness / 2 }),
                metadata: Object.freeze({ kind: 'boundary' }),
            }),
            Object.freeze({
                id: 'boundary-west',
                position: Object.freeze({ x: -WORLD_CONFIG.bounds.x - edgeThickness / 2, z: 0 }),
                halfExtents: Object.freeze({ x: edgeThickness / 2, z: WORLD_CONFIG.bounds.z + 1 }),
                metadata: Object.freeze({ kind: 'boundary' }),
            }),
            Object.freeze({
                id: 'boundary-east',
                position: Object.freeze({ x: WORLD_CONFIG.bounds.x + edgeThickness / 2, z: 0 }),
                halfExtents: Object.freeze({ x: edgeThickness / 2, z: WORLD_CONFIG.bounds.z + 1 }),
                metadata: Object.freeze({ kind: 'boundary' }),
            }),
            ...cabinets.map((cabinet) => Object.freeze({
                id: cabinet.id,
                position: Object.freeze({ x: cabinet.x, z: cabinet.z }),
                halfExtents: cabinet.collider.halfExtents,
                metadata: Object.freeze({ kind: 'arcade-cabinet', gameId: cabinet.gameId }),
            })),
        ]),
        triggers: Object.freeze(OPEN_WORLD_DISTRICTS.map((district) => Object.freeze({
            id: `district-${district.id}`,
            position: Object.freeze({ x: district.x, z: district.z }),
            radius: district.radius,
            metadata: Object.freeze({ kind: 'district', districtId: district.id, label: district.label }),
        }))),
    });
}
