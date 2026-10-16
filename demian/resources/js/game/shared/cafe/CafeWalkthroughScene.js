/** Canonical FBX geometry. Coordinates are gameplay units (4 units per source metre).
 * Rendering, collision, navigation, maps and save points share this transform.
 */
import generated from './FbxCafeData.js';
export function freezeCafe(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freezeCafe));
    if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, freezeCafe(item)]),
    ));
    return value;
}
export const CAFE_FBX = freezeCafe(generated);
export const CAFE_LAYOUT_VERSION = 5;
export const CAFE_GAMEPLAY_SCALE = 4;
export const cafePoint = (x, z) => Object.freeze({ x: x * CAFE_GAMEPLAY_SCALE + 0, z: z * CAFE_GAMEPLAY_SCALE + 0 });
export const fbxSourcePoint = (x, y) => cafePoint(-(x + 48.5125), y - 43);
export const CAFE_BOUNDS = CAFE_FBX.bounds;
export const CAFE_RENDER_BOUNDS = freezeCafe({ minX: CAFE_BOUNDS.minX - 1, maxX: CAFE_BOUNDS.maxX + 1,
    minZ: CAFE_BOUNDS.minZ - 1, maxZ: CAFE_BOUNDS.maxZ + 1 });
export const CAFE_FLOOR = freezeCafe({ width: CAFE_BOUNDS.maxX - CAFE_BOUNDS.minX,
    depth: CAFE_BOUNDS.maxZ - CAFE_BOUNDS.minZ, color: 0xd6cfc0 });
export const CAFE_ROOMS = freezeCafe([
    { id: 'entrance', label: 'ورودی و کتابخانه', bounds: { minX: -16, maxX: 16, minZ: -44, maxZ: 14.04 } },
    { id: 'rear-hall', label: 'سالن و نشیمن', bounds: { minX: -16, maxX: 16, minZ: -96, maxZ: -44 } },
    { id: 'service', label: 'راهرو و فضاهای پشتی', bounds: { minX: -16, maxX: 16, minZ: -143, maxZ: -96 } },
    { id: 'rear-room', label: 'فضای انتهایی مدل', bounds: { minX: -16, maxX: 16, minZ: -174.24, maxZ: -143 } },
]);
export const CAFE_WALLS = freezeCafe(CAFE_FBX.colliders.filter((e) => e.kind === 'wall'));
export const CAFE_FIXTURES = freezeCafe(CAFE_FBX.colliders.filter((e) => e.kind !== 'wall'));
// Detail is baked from the complete GLB rather than invented painter primitives.
export const CAFE_RUGS = Object.freeze([]), CAFE_DECOR = Object.freeze([]), CAFE_DOORS = Object.freeze([]),
    CAFE_LIGHTS = Object.freeze([]), CAFE_CEILING = Object.freeze([]);
export const CAFE_CHARACTER_SPAWNS = freezeCafe([
    { x: .36, z: -4.68 }, { x: -1.8, z: -11.16 }, { x: 3.96, z: -9.72 },
    { x: .36, z: -24.84 }, { x: .36, z: -44.28 }, { x: .36, z: -68.76 }, { x: 6.84, z: -104.04 },
]);
export const CAFE_WALKTHROUGH_ROUTE = freezeCafe([
    { id: 'entrance', x: .36, z: -4.68 }, { id: 'front-aisle', x: .36, z: -24.84 },
    { id: 'counter', x: 3.24, z: -30.6 }, { id: 'main-hall', x: .36, z: -44.28 },
    { id: 'lounge', x: .36, z: -68.76 }, { id: 'rear-hall', x: 1.08, z: -79.56 },
    { id: 'rear-transition', x: 3.96, z: -88.92 }, { id: 'corridor', x: 6.84, z: -104.04 },
    { id: 'wc-approach', x: 6.12, z: -119.16 }, { id: 'washroom', x: 3.96, z: -130.68 },
]);
export function cafeFloorAt(position) {
    if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return false;
    const col = Math.floor((position.x - CAFE_BOUNDS.minX) / CAFE_FBX.cellSize);
    const row = Math.floor((position.z - CAFE_BOUNDS.minZ) / CAFE_FBX.cellSize);
    return col >= 0 && col < CAFE_FBX.columns && row >= 0 && row < CAFE_FBX.rows
        && CAFE_FBX.floorRows[row][col] === '1';
}
export function cafeRoomAt(position, margin = 0) {
    if (!cafeFloorAt(position)) return null;
    if (margin > 0 && ![[-margin, 0], [margin, 0], [0, -margin], [0, margin]]
        .every(([x, z]) => cafeFloorAt({ x: position.x + x, z: position.z + z }))) return null;
    return CAFE_ROOMS.find(({ bounds: b }) => position.x >= b.minX && position.x <= b.maxX
        && position.z >= b.minZ && position.z <= b.maxZ) ?? null;
}
export const CAFE_SURVEY = freezeCafe({ source: 'دمیان .fbx', sourceSha256: CAFE_FBX.sourceSha256,
    layoutVersion: CAFE_LAYOUT_VERSION, sourceUnits: 'metres', units: 'gameplay-units', measured: false,
    gameplayScale: CAFE_GAMEPLAY_SCALE, runtimeDetail: 'fbx-baked', geometry: CAFE_FBX.modelCounts,
    note: 'Source model dimensions; not an on-site measurement. Closed model rooms remain closed.' });
