import WorldManifest from '../world/WorldManifest.js';

const CHUNK_SIZE = 12;
const ORIGIN = Object.freeze({ x: -24, z: -18 });

const DISTRICTS = Object.freeze([
    Object.freeze({ id: 'cafe-entrance', label: 'ورودی و میز جمعی', accent: '#d6a35c', center: { x: -12, z: 12 } }),
    Object.freeze({ id: 'cafe-counter', label: 'پیشخوان و بار', accent: '#3f9d7d', center: { x: 12, z: 6 } }),
    Object.freeze({ id: 'cafe-lounge', label: 'لانژ و استراحت', accent: '#8b6f62', center: { x: -12, z: -6 } }),
    Object.freeze({ id: 'cafe-gallery', label: 'فضای نشیمن داخلی', accent: '#7f7f88', center: { x: 12, z: -6 } }),
]);

const DISTRICT_BY_GRID = new Map([
    ['0:0', 'cafe-lounge'], ['1:0', 'cafe-lounge'], ['2:0', 'cafe-gallery'], ['3:0', 'cafe-gallery'],
    ['0:1', 'cafe-entrance'], ['1:1', 'cafe-entrance'], ['2:1', 'cafe-counter'], ['3:1', 'cafe-counter'],
    ['0:2', 'cafe-entrance'], ['1:2', 'cafe-entrance'], ['2:2', 'cafe-counter'], ['3:2', 'cafe-counter'],
]);

function createChunk(gridX, gridZ) {
    const districtId = DISTRICT_BY_GRID.get(`${gridX}:${gridZ}`) ?? 'cafe-gallery';
    return Object.freeze({
        id: `cafe-${gridX}-${gridZ}`,
        grid: Object.freeze({ x: gridX, z: gridZ }),
        districtId,
        theme: 'cafe',
        seed: 5100 + gridX * 137 + gridZ * 389,
        obstacles: Object.freeze([]),
        props: Object.freeze([]),
        pointsOfInterest: Object.freeze([]),
    });
}

const CHUNKS = Object.freeze(
    Array.from({ length: 3 }, (_, gridZ) => Array.from({ length: 4 }, (_, gridX) => createChunk(gridX, gridZ))).flat()
);

const chunkByCoordinate = (gridX, gridZ) => CHUNKS.find((chunk) => chunk.grid.x === gridX && chunk.grid.z === gridZ)?.id ?? null;

const SAVE_POINTS = Object.freeze([
    Object.freeze({ id: 'save-entrance', label: 'ورودی کافه', districtId: 'cafe-entrance', chunkId: chunkByCoordinate(1, 2), position: { x: 0, z: 14.8 } }),
    Object.freeze({ id: 'save-communal-table', label: 'میز جمعی', districtId: 'cafe-entrance', chunkId: chunkByCoordinate(0, 2), position: { x: -12.0, z: 8.8 } }),
    Object.freeze({ id: 'save-counter', label: 'پیشخوان', districtId: 'cafe-counter', chunkId: chunkByCoordinate(3, 1), position: { x: 14.8, z: 5.6 } }),
    Object.freeze({ id: 'save-lounge', label: 'لانژ', districtId: 'cafe-lounge', chunkId: chunkByCoordinate(0, 0), position: { x: -15.4, z: -9.5 } }),
]);

const enrichedChunks = CHUNKS.map((chunk) => Object.freeze({
    ...chunk,
    pointsOfInterest: Object.freeze([
        ...SAVE_POINTS.filter((point) => point.chunkId === chunk.id).map((point) => Object.freeze({
            id: point.id,
            type: 'save-point',
            label: point.label,
            position: point.position,
        })),
    ]),
}));

export const DEMIAN_REFERENCE_CAFE_DEFINITION = Object.freeze({
    id: 'demian-reference-cafe',
    version: 2,
    title: 'Demian Reference Café',
    chunkSize: CHUNK_SIZE,
    origin: ORIGIN,
    spawn: Object.freeze({ x: 0, z: 14.2 }),
    districts: DISTRICTS,
    savePoints: SAVE_POINTS,
    chunks: enrichedChunks,
    metadata: Object.freeze({
        phase: 9,
        activeRadius: 1,
        preloadRadius: 1,
        maxLoadedChunks: 8,
        source: 'real-cafe-reference',
        referencePhotosPath: 'public/assets/reference/cafe',
    }),
});

export const DEMIAN_REFERENCE_CAFE_MANIFEST = new WorldManifest(DEMIAN_REFERENCE_CAFE_DEFINITION);
export default DEMIAN_REFERENCE_CAFE_MANIFEST;
