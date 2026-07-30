const ALLOWED_THEMES = new Set(['cafe', 'arcade', 'park', 'market', 'industrial', 'residential', 'skyline']);

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function immutablePoint(point = {}) {
    return Object.freeze({ x: finite(point.x), z: finite(point.z) });
}

function immutableBounds(bounds = {}) {
    return Object.freeze({
        minX: finite(bounds.minX),
        maxX: finite(bounds.maxX),
        minZ: finite(bounds.minZ),
        maxZ: finite(bounds.maxZ),
    });
}

function freezeDefinition(definition) {
    if (Array.isArray(definition)) {
        return Object.freeze(definition.map((value) => freezeDefinition(value)));
    }
    if (definition && typeof definition === 'object') {
        return Object.freeze(Object.fromEntries(
            Object.entries(definition).map(([key, value]) => [key, freezeDefinition(value)])
        ));
    }
    return definition;
}

export function validateWorldManifest(manifest) {
    const errors = [];
    if (!manifest || typeof manifest !== 'object') return ['World manifest must be an object.'];
    if (!String(manifest.id ?? '').trim()) errors.push('World manifest id is required.');
    if (!Number.isInteger(manifest.version) || manifest.version < 1) errors.push('World manifest version must be a positive integer.');
    if (!Number.isFinite(manifest.chunkSize) || manifest.chunkSize < 8) errors.push('chunkSize must be at least 8.');
    if (!Number.isFinite(manifest.origin?.x) || !Number.isFinite(manifest.origin?.z)) errors.push('World origin requires finite x/z.');
    if (!Array.isArray(manifest.chunks) || manifest.chunks.length === 0) errors.push('At least one chunk is required.');
    if (!Array.isArray(manifest.districts) || manifest.districts.length === 0) errors.push('At least one district is required.');
    if (!Array.isArray(manifest.savePoints) || manifest.savePoints.length === 0) errors.push('At least one save point is required.');

    const chunkIds = new Set();
    const coordinates = new Set();
    for (const chunk of manifest.chunks ?? []) {
        const id = String(chunk?.id ?? '').trim();
        if (!id) errors.push('Every chunk requires an id.');
        if (chunkIds.has(id)) errors.push(`Duplicate chunk id: ${id}`);
        chunkIds.add(id);
        const x = Number(chunk?.grid?.x);
        const z = Number(chunk?.grid?.z);
        if (!Number.isInteger(x) || !Number.isInteger(z)) errors.push(`Chunk ${id || '?'} requires integer grid coordinates.`);
        const coordinate = `${x}:${z}`;
        if (coordinates.has(coordinate)) errors.push(`Duplicate chunk coordinate: ${coordinate}`);
        coordinates.add(coordinate);
        if (!String(chunk?.districtId ?? '').trim()) errors.push(`Chunk ${id || '?'} requires districtId.`);
        if (!ALLOWED_THEMES.has(chunk?.theme)) errors.push(`Chunk ${id || '?'} has unknown theme: ${chunk?.theme}`);
        if (!Number.isFinite(chunk?.seed)) errors.push(`Chunk ${id || '?'} requires numeric seed.`);
        if (!Array.isArray(chunk?.obstacles)) errors.push(`Chunk ${id || '?'} obstacles must be an array.`);
    }

    const districtIds = new Set();
    for (const district of manifest.districts ?? []) {
        const id = String(district?.id ?? '').trim();
        if (!id) errors.push('Every district requires an id.');
        if (districtIds.has(id)) errors.push(`Duplicate district id: ${id}`);
        districtIds.add(id);
        if (!String(district?.label ?? '').trim()) errors.push(`District ${id || '?'} requires label.`);
    }
    for (const chunk of manifest.chunks ?? []) {
        if (chunk?.districtId && !districtIds.has(chunk.districtId)) errors.push(`Chunk ${chunk.id} references missing district ${chunk.districtId}.`);
    }

    const savePointIds = new Set();
    for (const point of manifest.savePoints ?? []) {
        const id = String(point?.id ?? '').trim();
        if (!id) errors.push('Every save point requires an id.');
        if (savePointIds.has(id)) errors.push(`Duplicate save point id: ${id}`);
        savePointIds.add(id);
        if (!chunkIds.has(point?.chunkId)) errors.push(`Save point ${id || '?'} references missing chunk ${point?.chunkId}.`);
        if (!districtIds.has(point?.districtId)) errors.push(`Save point ${id || '?'} references missing district ${point?.districtId}.`);
        if (!Number.isFinite(point?.position?.x) || !Number.isFinite(point?.position?.z)) errors.push(`Save point ${id || '?'} requires a finite position.`);
    }

    const spawn = manifest.spawn ?? {};
    if (!Number.isFinite(spawn.x) || !Number.isFinite(spawn.z)) errors.push('World spawn requires finite x/z.');
    return errors;
}

export function normalizeWorldManifest(input) {
    const errors = validateWorldManifest(input);
    if (errors.length > 0) throw new TypeError(`Invalid world manifest: ${errors.join(' | ')}`);
    const chunkSize = Number(input.chunkSize);
    const origin = immutablePoint(input.origin ?? { x: 0, z: 0 });
    const chunks = input.chunks.map((chunk) => {
        const center = {
            x: origin.x + (chunk.grid.x + 0.5) * chunkSize,
            z: origin.z + (chunk.grid.z + 0.5) * chunkSize,
        };
        return freezeDefinition({
            ...chunk,
            center,
            bounds: {
                minX: origin.x + chunk.grid.x * chunkSize,
                maxX: origin.x + (chunk.grid.x + 1) * chunkSize,
                minZ: origin.z + chunk.grid.z * chunkSize,
                maxZ: origin.z + (chunk.grid.z + 1) * chunkSize,
            },
            obstacles: chunk.obstacles ?? [],
            props: chunk.props ?? [],
            pointsOfInterest: chunk.pointsOfInterest ?? [],
        });
    });
    const minGridX = Math.min(...chunks.map((chunk) => chunk.grid.x));
    const maxGridX = Math.max(...chunks.map((chunk) => chunk.grid.x));
    const minGridZ = Math.min(...chunks.map((chunk) => chunk.grid.z));
    const maxGridZ = Math.max(...chunks.map((chunk) => chunk.grid.z));
    const bounds = immutableBounds({
        minX: origin.x + minGridX * chunkSize,
        maxX: origin.x + (maxGridX + 1) * chunkSize,
        minZ: origin.z + minGridZ * chunkSize,
        maxZ: origin.z + (maxGridZ + 1) * chunkSize,
    });
    return Object.freeze({
        id: String(input.id),
        version: Number(input.version),
        title: String(input.title ?? input.id),
        chunkSize,
        origin,
        spawn: immutablePoint(input.spawn),
        bounds,
        chunks: Object.freeze(chunks),
        districts: freezeDefinition(input.districts),
        savePoints: freezeDefinition(input.savePoints),
        metadata: freezeDefinition(input.metadata ?? {}),
    });
}

export default class WorldManifest {
    constructor(definition) {
        this.definition = normalizeWorldManifest(definition);
        this.chunkById = new Map(this.definition.chunks.map((chunk) => [chunk.id, chunk]));
        this.chunkByCoordinate = new Map(this.definition.chunks.map((chunk) => [`${chunk.grid.x}:${chunk.grid.z}`, chunk]));
        this.districtById = new Map(this.definition.districts.map((district) => [district.id, district]));
        this.savePointById = new Map(this.definition.savePoints.map((point) => [point.id, point]));
        Object.freeze(this);
    }

    get id() { return this.definition.id; }
    get version() { return this.definition.version; }
    get chunkSize() { return this.definition.chunkSize; }
    get origin() { return this.definition.origin; }
    get spawn() { return this.definition.spawn; }
    get bounds() { return this.definition.bounds; }
    get chunks() { return this.definition.chunks; }
    get districts() { return this.definition.districts; }
    get savePoints() { return this.definition.savePoints; }

    chunk(id) { return this.chunkById.get(String(id)) ?? null; }
    at(gridX, gridZ) { return this.chunkByCoordinate.get(`${gridX}:${gridZ}`) ?? null; }
    district(id) { return this.districtById.get(String(id)) ?? null; }
    savePoint(id) { return this.savePointById.get(String(id)) ?? null; }
    serialize() { return this.definition; }
}
