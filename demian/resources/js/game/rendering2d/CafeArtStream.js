import art from '../../../game/cafe-art.json' with { type: 'json' };
import { CAFE_BOUNDS } from '../shared/cafe/CafeWalkthroughScene.js';
import { fbxCafeAssetUrl, fbxFloorplanImage } from './FbxCafeAssets.js';

const PROFILES = Object.freeze({
    performance: Object.freeze({ quality: 'performance', maxWidth: 1024, maxTiles: 8, concurrency: 1, maxPixelRatio: 1, pixelBudget: 1000000 }),
    balanced: Object.freeze({ quality: 'balanced', maxWidth: 1536, maxTiles: 12, concurrency: 2, maxPixelRatio: 1.35, pixelBudget: 1250000 }),
    high: Object.freeze({ quality: 'high', maxWidth: 2048, maxTiles: 20, concurrency: 3, maxPixelRatio: 1.75, pixelBudget: 2200000 }),
});
const width = CAFE_BOUNDS.maxX - CAFE_BOUNDS.minX, height = CAFE_BOUNDS.maxZ - CAFE_BOUNDS.minZ;
const previewBytes = art.preview.width * art.preview.height * 4;
const tileBytes = (art.tileSize + art.gutter * 2) ** 2 * 4;

export function cafeQualityProfile(preference = 'auto', detected = 'balanced') {
    return PROFILES[preference] ?? PROFILES[detected] ?? PROFILES.balanced;
}

export function cafeArtLevel(camera, profile) {
    const demand = camera.pixelsPerUnit * width * 1.15;
    if (demand <= art.preview.width) return null;
    const levels = art.levels.filter(level => level.width <= profile.maxWidth);
    return levels.find(level => level.width >= demand) ?? levels.at(-1);
}

export function visibleCafeTiles(camera, level, padding = 0) {
    if (!level || !Number.isFinite(camera.pixelsPerUnit) || camera.pixelsPerUnit <= 0) return [];
    const halfX = (camera.viewportWidth / 2 + padding) / camera.pixelsPerUnit;
    const halfZ = (camera.viewportHeight / 2 + padding) / camera.pixelsPerUnit;
    const minX = Math.max(CAFE_BOUNDS.minX, camera.position.x - halfX), maxX = Math.min(CAFE_BOUNDS.maxX, camera.position.x + halfX);
    const minZ = Math.max(CAFE_BOUNDS.minZ, camera.position.z - halfZ), maxZ = Math.min(CAFE_BOUNDS.maxZ, camera.position.z + halfZ);
    if (maxX <= minX || maxZ <= minZ) return [];
    const left = Math.max(0, Math.floor((minX - CAFE_BOUNDS.minX) / width * level.width / art.tileSize));
    const right = Math.min(level.columns - 1, Math.ceil((maxX - CAFE_BOUNDS.minX) / width * level.width / art.tileSize) - 1);
    const top = Math.max(0, Math.floor((minZ - CAFE_BOUNDS.minZ) / height * level.height / art.tileSize));
    const bottom = Math.min(level.rows - 1, Math.ceil((maxZ - CAFE_BOUNDS.minZ) / height * level.height / art.tileSize) - 1);
    const tiles = [];
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
        const x = col * art.tileSize, y = row * art.tileSize;
        const cx = CAFE_BOUNDS.minX + (x + art.tileSize / 2) / level.width * width;
        const cz = CAFE_BOUNDS.minZ + (y + art.tileSize / 2) / level.height * height;
        tiles.push({ id: `${level.width}:${row}:${col}`, file: `polished-v1/lod-${level.width}/${row}-${col}.webp`, x, y, level,
            distance: Math.hypot(cx - camera.position.x, cz - camera.position.z) });
    }
    return tiles.sort((a, b) => a.distance - b.distance);
}

async function loadTile(url, { signal }) {
    const response = await fetch(url, { signal });
    if (!response.ok) throw Error('Cafe tile unavailable');
    const blob = await response.blob();
    if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
    const objectUrl = URL.createObjectURL(blob);
    try { const image = new Image(); image.src = objectUrl; await image.decode(); return image; }
    finally { URL.revokeObjectURL(objectUrl); }
}

export default class CafeArtStream {
    constructor({ quality = 'auto', detected = 'balanced', loader = loadTile, clock = Date.now } = {}) {
        this.profile = cafeQualityProfile(quality, detected); this.detected = detected;
        this.loader = loader; this.clock = clock;
        this.ready = new Map(); this.active = new Map(); this.failed = new Map();
        this.queue = []; this.desired = new Set();
        this.revision = 0; this.generation = 0; this.disposed = false;
        this.loadedBytes = 0; this.level = null;
        this.viewKey = null; this.retryAt = Infinity;
    }

    setQuality(preference) {
        const next = cafeQualityProfile(preference, this.detected);
        if (next === this.profile) return false;
        this.profile = next; this.generation++; this.revision++;
        this.viewKey = null;
        for (const entry of this.active.values()) entry.controller.abort();
        for (const id of this.ready.keys()) this.evict(id);
        this.queue = []; this.desired.clear();
        return true;
    }

    prepare(camera, padding = 0) {
        if (this.disposed) return;
        const viewKey = [camera.position.x, camera.position.z, camera.pixelsPerUnit,
            camera.viewportWidth, camera.viewportHeight, padding, this.profile.quality].join(':');
        const now = this.clock();
        if (this.viewKey === viewKey && now < this.retryAt) return;
        this.viewKey = viewKey; this.retryAt = Infinity;
        this.level = cafeArtLevel(camera, this.profile);
        const tiles = visibleCafeTiles(camera, this.level, padding).slice(0, this.profile.maxTiles);
        for (const tile of tiles) {
            const retry = this.failed.get(tile.id);
            if (retry > now) this.retryAt = Math.min(this.retryAt, retry);
        }
        this.desired = new Set(tiles.map(tile => tile.id));
        for (const [id, entry] of this.active) if (!this.desired.has(id)) entry.controller.abort();
        for (const tile of tiles) {
            const entry = this.ready.get(tile.id);
            if (entry) { this.ready.delete(tile.id); this.ready.set(tile.id, entry); }
        }
        this.queue = tiles.filter(tile => !this.ready.has(tile.id) && !this.active.has(tile.id)
            && (this.failed.get(tile.id) ?? 0) <= this.clock());
        this.pump();
    }

    evict(id) {
        const entry = this.ready.get(id);
        if (!entry) return;
        entry.image.close?.(); this.loadedBytes -= entry.bytes;
        this.ready.delete(id); this.revision++;
    }

    pump() {
        while (!this.disposed && this.active.size < this.profile.concurrency && this.queue.length) {
            if (this.ready.size + this.active.size >= this.profile.maxTiles) {
                const victim = [...this.ready.keys()].find(id => !this.desired.has(id));
                if (!victim) return;
                this.evict(victim);
            }
            const tile = this.queue.shift();
            if (!this.desired.has(tile.id) || this.ready.has(tile.id) || this.active.has(tile.id)) continue;
            const entry = { controller: new AbortController(), generation: this.generation };
            this.active.set(tile.id, entry);
            entry.timer = setTimeout(() => { entry.timedOut = true; entry.controller.abort(); }, 8000);
            entry.promise = Promise.resolve().then(() => this.loader(fbxCafeAssetUrl(tile.file), { signal: entry.controller.signal }))
                .then(image => {
                    if (!image) throw Error('Cafe tile did not decode');
                    if (this.disposed || entry.generation !== this.generation || !this.desired.has(tile.id) || entry.controller.signal.aborted) { image.close?.(); return; }
                    const bytes = image.width * image.height * 4;
                    if (bytes > tileBytes || this.loadedBytes + bytes > this.profile.maxTiles * tileBytes) { image.close?.(); return; }
                    this.ready.set(tile.id, { image, tile, bytes }); this.loadedBytes += bytes; this.revision++;
                })
                .catch(() => {
                    if (!this.disposed && entry.generation === this.generation && this.desired.has(tile.id)
                        && (!entry.controller.signal.aborted || entry.timedOut)) {
                        const retry = this.clock() + 30000;
                        this.failed.set(tile.id, retry); this.retryAt = Math.min(this.retryAt, retry);
                    }
                })
                .finally(() => { clearTimeout(entry.timer); this.active.delete(tile.id); if (!this.disposed) this.pump(); });
        }
    }

    draw(ctx, camera) {
        for (const id of this.desired) {
            const entry = this.ready.get(id);
            if (!entry) continue;
            const { tile, image } = entry;
            const p = camera.worldToScreen({ x: CAFE_BOUNDS.minX + (tile.x - art.gutter) / tile.level.width * width,
                z: CAFE_BOUNDS.minZ + (tile.y - art.gutter) / tile.level.height * height });
            ctx.drawImage(image, p.x, p.y, image.width / tile.level.width * width * camera.pixelsPerUnit,
                image.height / tile.level.height * height * camera.pixelsPerUnit);
        }
    }

    stats() {
        return { quality: this.profile.quality, level: this.level?.width ?? art.preview.width,
            ready: this.ready.size, active: this.active.size, queued: this.queue.length, failed: this.failed.size,
            maxTiles: this.profile.maxTiles, decodedBytes: this.loadedBytes + (fbxFloorplanImage() ? previewBytes : 0),
            maxDecodedBytes: previewBytes + this.profile.maxTiles * tileBytes, disposed: this.disposed };
    }

    dispose() {
        this.disposed = true; this.generation++;
        for (const entry of this.active.values()) entry.controller.abort();
        for (const id of this.ready.keys()) this.evict(id);
        this.queue = []; this.desired.clear(); this.failed.clear();
    }
}
