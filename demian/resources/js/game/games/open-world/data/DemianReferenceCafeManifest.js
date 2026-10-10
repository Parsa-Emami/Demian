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
    Object.freeze({ id: 'lounge', label: 'لانژ و گرامافون', color: '#8b8894' }),
    Object.freeze({ id: 'restroom', label: 'روشویی و WC', color: '#749981' }),
]);
function districtFor(x, z) {
    if (z <= 1) return 'restroom';
    if (z <= 4) return x === 0 ? 'dining' : 'lounge';
    return x === 0 ? 'entrance' : 'counter';
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
    const gx = Math.floor((x - ORIGIN.x) / CHUNK_SIZE), gz = Math.floor((z - ORIGIN.z) / CHUNK_SIZE);
    return Object.freeze({ id, label, chunkId: `cafe-${gx}-${gz}`, districtId: districtFor(gx, gz), position: Object.freeze({ x, z }) });
}
export const DEMIAN_REFERENCE_CAFE_DEFINITION = Object.freeze({
    id: 'demian-reference-cafe', version: CAFE_LAYOUT_VERSION,
    title: 'Demian Café — Entrance to WC', chunkSize: CHUNK_SIZE, origin: ORIGIN,
    spawn: CAFE_CHARACTER_SPAWNS[0], districts: DISTRICTS, chunks: CHUNKS,
    savePoints: Object.freeze([
        savePoint('save-entrance', 'ورودی', 0, 14.2),
        savePoint('save-counter', 'پیشخوان', 3, 7),
        savePoint('save-lounge', 'لانژ', .8, -29),
        // Preserve this save ID so an old unlocked destination remains usable.
        savePoint('save-arcade', 'میزهای سالن پشتی', .8, -15),
        savePoint('save-restroom', 'ورودی WC', 2.6, -41),
    ]),
    metadata: Object.freeze({
        environment: CAFE_ENVIRONMENT_ID, renderer: 'canvas2d-pixel', layoutVersion: CAFE_LAYOUT_VERSION,
        activeRadius: 0, preloadRadius: 1, maxLoadedChunks: 8, projection: 'top-down',
        referenceBounds: CAFE_BOUNDS, survey: CAFE_SURVEY,
    }),
});
export const DEMIAN_REFERENCE_CAFE_MANIFEST = new WorldManifest(DEMIAN_REFERENCE_CAFE_DEFINITION);
export default DEMIAN_REFERENCE_CAFE_MANIFEST;
