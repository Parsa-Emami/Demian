import WorldManifest from '../world/WorldManifest.js';

const CHUNK_SIZE = 32;
const DISTRICTS = Object.freeze([
    { id: 'neon-park', label: 'پارک نئون', accent: '#22d3ee', center: { x: -64, z: 0 } },
    { id: 'story-alley', label: 'کوچه داستان', accent: '#a78bfa', center: { x: -64, z: -32 } },
    { id: 'cafe-core', label: 'کافه دمیان', accent: '#f472b6', center: { x: 0, z: 0 } },
    { id: 'arcade-quarter', label: 'محله آرکید', accent: '#facc15', center: { x: 32, z: 0 } },
    { id: 'maker-docks', label: 'اسکله سازندگان', accent: '#34d399', center: { x: 32, z: -32 } },
    { id: 'skyline', label: 'بلوار آسمان', accent: '#60a5fa', center: { x: 0, z: 32 } },
]);

const DISTRICT_BY_GRID = new Map([
    ['-3:-2', 'story-alley'], ['-2:-2', 'story-alley'], ['-1:-2', 'story-alley'],
    ['0:-2', 'maker-docks'], ['1:-2', 'maker-docks'], ['2:-2', 'maker-docks'],
    ['-3:-1', 'story-alley'], ['-2:-1', 'story-alley'], ['-1:-1', 'cafe-core'],
    ['0:-1', 'cafe-core'], ['1:-1', 'maker-docks'], ['2:-1', 'maker-docks'],
    ['-3:0', 'neon-park'], ['-2:0', 'neon-park'], ['-1:0', 'cafe-core'],
    ['0:0', 'cafe-core'], ['1:0', 'arcade-quarter'], ['2:0', 'arcade-quarter'],
    ['-3:1', 'neon-park'], ['-2:1', 'neon-park'], ['-1:1', 'skyline'],
    ['0:1', 'skyline'], ['1:1', 'skyline'], ['2:1', 'arcade-quarter'],
]);

const THEME_BY_DISTRICT = Object.freeze({
    'neon-park': 'park',
    'story-alley': 'residential',
    'cafe-core': 'cafe',
    'arcade-quarter': 'arcade',
    'maker-docks': 'industrial',
    skyline: 'skyline',
});

function seeded(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function obstaclesFor(gridX, gridZ, seed) {
    const random = seeded(seed);
    const obstacles = [];
    const legacyCore = Math.abs(gridX) <= 1 && (gridZ === -1 || gridZ === 0);
    const count = legacyCore ? 0 : 3 + Math.floor(random() * 4);
    for (let index = 0; index < count; index += 1) {
        const width = 1.4 + random() * 2.8;
        const depth = 1.4 + random() * 2.8;
        const localX = 4 + random() * (CHUNK_SIZE - 8);
        const localZ = 4 + random() * (CHUNK_SIZE - 8);
        if (Math.abs(localX - CHUNK_SIZE / 2) < 4 || Math.abs(localZ - CHUNK_SIZE / 2) < 4) continue;
        obstacles.push({
            id: `obstacle-${index}`,
            position: { x: gridX * CHUNK_SIZE + localX, z: gridZ * CHUNK_SIZE + localZ },
            halfExtents: { x: width / 2, z: depth / 2 },
            height: 1.4 + random() * 3.6,
        });
    }
    return obstacles;
}

const chunks = [];
for (let z = -2; z <= 1; z += 1) {
    for (let x = -3; x <= 2; x += 1) {
        const districtId = DISTRICT_BY_GRID.get(`${x}:${z}`);
        const seed = 8000 + (x + 4) * 101 + (z + 3) * 997;
        chunks.push({
            id: `chunk-${x >= 0 ? 'p' : 'n'}${Math.abs(x)}-${z >= 0 ? 'p' : 'n'}${Math.abs(z)}`,
            grid: { x, z },
            districtId,
            theme: THEME_BY_DISTRICT[districtId],
            seed,
            legacyHub: x === 0 && z === 0,
            obstacles: obstaclesFor(x, z, seed),
            pointsOfInterest: [],
            props: [],
        });
    }
}

function chunkIdAt(x, z) {
    return chunks.find((chunk) => chunk.grid.x === x && chunk.grid.z === z)?.id;
}

const savePoints = Object.freeze([
    { id: 'save-cafe', label: 'ورودی کافه دمیان', districtId: 'cafe-core', chunkId: chunkIdAt(0, 0), position: { x: 4, z: 4 } },
    { id: 'save-park', label: 'فواره پارک نئون', districtId: 'neon-park', chunkId: chunkIdAt(-2, 0), position: { x: -64, z: 0 } },
    { id: 'save-story', label: 'کتابخانه کوچه داستان', districtId: 'story-alley', chunkId: chunkIdAt(-2, -1), position: { x: -64, z: -32 } },
    { id: 'save-arcade', label: 'دروازه محله آرکید', districtId: 'arcade-quarter', chunkId: chunkIdAt(1, 0), position: { x: 32, z: 0 } },
    { id: 'save-docks', label: 'برج کنترل اسکله', districtId: 'maker-docks', chunkId: chunkIdAt(1, -1), position: { x: 32, z: -32 } },
    { id: 'save-skyline', label: 'ایستگاه بلوار آسمان', districtId: 'skyline', chunkId: chunkIdAt(0, 1), position: { x: 0, z: 32 } },
]);

const enrichedChunks = chunks.map((chunk) => ({
    ...chunk,
    pointsOfInterest: [
        ...chunk.pointsOfInterest,
        ...savePoints.filter((point) => point.chunkId === chunk.id).map((point) => ({
            id: point.id,
            type: 'save-point',
            label: point.label,
            position: point.position,
        })),
    ],
}));

export const DEMIAN_CITY_MANIFEST_DEFINITION = Object.freeze({
    id: 'demian-city',
    version: 1,
    title: 'Demian City',
    chunkSize: CHUNK_SIZE,
    origin: { x: -16, z: -16 },
    spawn: { x: 4, z: 4 },
    districts: DISTRICTS,
    savePoints,
    chunks: enrichedChunks,
    metadata: {
        phase: 8,
        activeRadius: 1,
        preloadRadius: 2,
        maxLoadedChunks: 14,
        source: 'bundled-procedural',
    },
});

export const DEMIAN_CITY_MANIFEST = new WorldManifest(DEMIAN_CITY_MANIFEST_DEFINITION);
export default DEMIAN_CITY_MANIFEST;
