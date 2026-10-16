import WorldManifest from '../world/WorldManifest.js';
import { CAFE_BOUNDS, CAFE_STATIC_COLLIDERS } from '../../../shared/cafe/CafeReferenceLayout.js';
import { CAFE_LAYOUT_VERSION, CAFE_CHARACTER_SPAWNS, CAFE_SURVEY } from '../../../shared/cafe/CafeWalkthroughScene.js';
import { CAFE_ENVIRONMENT_ID } from '../../../shared/cafe/CafeEnvironmentContract.js';

const CHUNK_SIZE = 12;
const ORIGIN = Object.freeze({ x: CAFE_BOUNDS.minX, z: CAFE_BOUNDS.minZ });
const COLUMNS = Math.ceil((CAFE_BOUNDS.maxX - CAFE_BOUNDS.minX) / CHUNK_SIZE);
const ROWS = Math.ceil((CAFE_BOUNDS.maxZ - CAFE_BOUNDS.minZ) / CHUNK_SIZE);
const DISTRICTS = Object.freeze([
    Object.freeze({ id: 'entrance', label: 'ورودی و کتابخانه', color: '#becbc0' }),
    Object.freeze({ id: 'counter', label: 'پیشخوان و محصولات', color: '#b99a62' }),
    Object.freeze({ id: 'dining', label: 'میزهای سالن پشتی', color: '#ac9180' }),
    Object.freeze({ id: 'lounge', label: 'نشیمن', color: '#8b8894' }),
    Object.freeze({ id: 'restroom', label: 'راهرو و فضاهای پشتی', color: '#749981' }),
]);
function districtFor(x, z) {
    const worldZ = ORIGIN.z + (z + .5) * CHUNK_SIZE;
    if (worldZ < -96) return 'restroom';
    if (worldZ < -44) return x < 2 ? 'dining' : 'lounge';
    return x < 2 ? 'entrance' : 'counter';
}
function chunkBounds(x, z) {
    return { minX: ORIGIN.x + x * CHUNK_SIZE, maxX: ORIGIN.x + (x + 1) * CHUNK_SIZE,
        minZ: ORIGIN.z + z * CHUNK_SIZE, maxZ: ORIGIN.z + (z + 1) * CHUNK_SIZE };
}
function obstaclesFor(x, z) {
    const b = chunkBounds(x, z);
    // A long wall belongs to every chunk that intersects it, not only the
    // chunk containing its centre. Gameplay collision is still registered once.
    return CAFE_STATIC_COLLIDERS.filter(({ position: p, halfExtents: h }) =>
        p.x + h.x >= b.minX && p.x - h.x <= b.maxX && p.z + h.z >= b.minZ && p.z - h.z <= b.maxZ);
}
const CHUNKS = Object.freeze(Array.from({ length: ROWS }, (_, z) =>
    Array.from({ length: COLUMNS }, (_, x) => Object.freeze({
        id: `cafe-${x}-${z}`, grid: Object.freeze({ x, z }), districtId: districtFor(x, z),
        theme: 'cafe', seed: 8200 + z * 10 + x,
        obstacles: Object.freeze(obstaclesFor(x, z)), props: Object.freeze([]), pointsOfInterest: Object.freeze([]),
    }))
).flat());
function savePoint(id, label, x, z) {
    // Positions already use the canonical FBX transform.
    const gx = Math.floor((x - ORIGIN.x) / CHUNK_SIZE), gz = Math.floor((z - ORIGIN.z) / CHUNK_SIZE);
    return Object.freeze({ id, label, chunkId: `cafe-${gx}-${gz}`, districtId: districtFor(gx, gz), position: Object.freeze({ x, z }) });
}
export const DEMIAN_REFERENCE_CAFE_DEFINITION = Object.freeze({
    id: 'demian-reference-cafe', version: CAFE_LAYOUT_VERSION, bounds: CAFE_BOUNDS,
    title: 'Demian Café', chunkSize: CHUNK_SIZE, origin: ORIGIN,
    spawn: CAFE_CHARACTER_SPAWNS[0], districts: DISTRICTS, chunks: CHUNKS,
    savePoints: Object.freeze([
        savePoint('save-entrance', 'ورودی', .36, -4.68),
        savePoint('save-counter', 'پیشخوان', 3.24, -30.6),
        savePoint('save-lounge', 'لانژ', .36, -68.76),
        // Preserve this save ID so an old unlocked destination remains usable.
        savePoint('save-arcade', 'میزهای سالن پشتی', 3.96, -88.92),
        savePoint('save-restroom', 'راهروی پشتی', 6.12, -119.16),
    ]),
    metadata: Object.freeze({
        environment: CAFE_ENVIRONMENT_ID, renderer: 'fbx-baked-canvas2d', layoutVersion: CAFE_LAYOUT_VERSION,
        activeRadius: 0, preloadRadius: 1, maxLoadedChunks: 8, projection: 'top-down',
        referenceBounds: CAFE_BOUNDS, survey: CAFE_SURVEY,
    }),
});
export const DEMIAN_REFERENCE_CAFE_MANIFEST = new WorldManifest(DEMIAN_REFERENCE_CAFE_DEFINITION);
export default DEMIAN_REFERENCE_CAFE_MANIFEST;
