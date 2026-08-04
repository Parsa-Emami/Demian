import WorldManifest from '../world/WorldManifest.js';
import { CAFE_BOUNDS, CAFE_STATIC_COLLIDERS } from '../../../shared/cafe/CafeReferenceLayout.js';
import { CAFE_ENVIRONMENT_ID } from '../../../shared/cafe/CafeEnvironmentContract.js';

const CHUNK_SIZE = 12;
const ORIGIN = Object.freeze({ x: CAFE_BOUNDS.minX, z: CAFE_BOUNDS.minZ });

const DISTRICTS = Object.freeze([
    Object.freeze({ id: 'entrance', label: 'ورودی و سالن اصلی', color: '#67e8f9' }),
    Object.freeze({ id: 'counter', label: 'پیشخوان کافه', color: '#f59e0b' }),
    Object.freeze({ id: 'lounge', label: 'لانژ و گفتگو', color: '#a78bfa' }),
    Object.freeze({ id: 'arcade', label: 'آرکید و رویدادها', color: '#f472b6' }),
]);

function districtFor(gridX, gridZ) {
    if (gridZ === 2) return gridX >= 2 ? 'counter' : 'entrance';
    if (gridZ === 0) return gridX >= 2 ? 'arcade' : 'lounge';
    return gridX >= 2 ? 'counter' : 'entrance';
}

function chunkBounds(gridX, gridZ) {
    return {
        minX: ORIGIN.x + gridX * CHUNK_SIZE,
        maxX: ORIGIN.x + (gridX + 1) * CHUNK_SIZE,
        minZ: ORIGIN.z + gridZ * CHUNK_SIZE,
        maxZ: ORIGIN.z + (gridZ + 1) * CHUNK_SIZE,
    };
}

function obstaclesFor(gridX, gridZ) {
    const bounds = chunkBounds(gridX, gridZ);
    return CAFE_STATIC_COLLIDERS.filter(({ position }) => (
        position.x >= bounds.minX && position.x < bounds.maxX &&
        position.z >= bounds.minZ && position.z < bounds.maxZ
    )).map(({ id, kind, position, halfExtents, height }) => ({ id, kind, position, halfExtents, height }));
}

const CHUNKS = Object.freeze(Array.from({ length: 3 }, (_, gridZ) => (
    Array.from({ length: 4 }, (_, gridX) => Object.freeze({
        id: `cafe-${gridX}-${gridZ}`,
        grid: Object.freeze({ x: gridX, z: gridZ }),
        districtId: districtFor(gridX, gridZ),
        theme: 'cafe',
        seed: 8200 + gridZ * 10 + gridX,
        obstacles: Object.freeze(obstaclesFor(gridX, gridZ)),
        props: Object.freeze([]),
        pointsOfInterest: Object.freeze([]),
    }))
)).flat());

export const DEMIAN_REFERENCE_CAFE_DEFINITION = Object.freeze({
    id: 'demian-reference-cafe',
    version: 2,
    title: 'Demian Reference Café — Pixel World',
    chunkSize: CHUNK_SIZE,
    origin: ORIGIN,
    spawn: Object.freeze({ x: 0, z: 14.2 }),
    districts: DISTRICTS,
    chunks: CHUNKS,
    savePoints: Object.freeze([
        Object.freeze({ id: 'save-entrance', label: 'ورودی', chunkId: 'cafe-2-2', districtId: 'entrance', position: Object.freeze({ x: 0, z: 14.2 }) }),
        Object.freeze({ id: 'save-counter', label: 'پیشخوان', chunkId: 'cafe-3-1', districtId: 'counter', position: Object.freeze({ x: 14.8, z: 5.6 }) }),
        Object.freeze({ id: 'save-lounge', label: 'لانژ', chunkId: 'cafe-0-0', districtId: 'lounge', position: Object.freeze({ x: -16, z: -12 }) }),
        Object.freeze({ id: 'save-arcade', label: 'آرکید', chunkId: 'cafe-3-0', districtId: 'arcade', position: Object.freeze({ x: 18, z: -10 }) }),
    ]),
    metadata: Object.freeze({
        environment: CAFE_ENVIRONMENT_ID,
        renderer: 'canvas2d-pixel',
        activeRadius: 0,
        preloadRadius: 1,
        maxLoadedChunks: 12,
        projection: 'top-down',
        referenceBounds: CAFE_BOUNDS,
    }),
});

export const DEMIAN_REFERENCE_CAFE_MANIFEST = new WorldManifest(DEMIAN_REFERENCE_CAFE_DEFINITION);
export default DEMIAN_REFERENCE_CAFE_MANIFEST;
