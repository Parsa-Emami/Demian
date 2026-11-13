/**
 * Mobile-03 — bounded strong references to decoded sprite sheets.
 *
 * These budgets account only for cached atlas image pixel estimates (RGBA8).
 * Existing Canvas and THREE consumers may still hold references, so eviction is
 * never presented as an immediate reduction of native/GPU/process memory.
 */
const MiB = 1024 * 1024;
const BUDGET_BY_TIER = Object.freeze({ performance: 8 * MiB, balanced: 20 * MiB, high: 40 * MiB });

export function spriteCacheBudgetBytes(performanceProfile, approximateDeviceMemory = globalThis.navigator?.deviceMemory) {
    const tier = performanceProfile?.tier ?? 'balanced';
    const budget = BUDGET_BY_TIER[tier] ?? BUDGET_BY_TIER.balanced;
    const memoryGiB = Number(approximateDeviceMemory);
    // navigator.deviceMemory is a coarse, optional hint and absent on Safari.
    // Unknown memory must NOT accidentally become 0 (Number(null) === 0).
    if (approximateDeviceMemory == null || !Number.isFinite(memoryGiB) || memoryGiB <= 0) return budget;
    return memoryGiB <= 2 ? Math.min(budget, 8 * MiB) : budget;
}

export function decodedSpriteBytes(pack) {
    const width = Number(pack?.image?.naturalWidth || pack?.image?.width || pack?.atlas?.meta?.size?.w || 0);
    const height = Number(pack?.image?.naturalHeight || pack?.image?.height || pack?.atlas?.meta?.size?.h || 0);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 0;
    return Math.ceil(width * height * 4);
}

export function cachedSpriteBytes(cache) {
    let total = 0;
    for (const pack of cache.values()) total += decodedSpriteBytes(pack);
    return total;
}

/** LRU cache: iteration order is oldest -> newest; keep one oversize entry if necessary. */
export function trimSpriteCache(cache, budgetBytes) {
    if (!Number.isFinite(budgetBytes) || budgetBytes <= 0) throw new RangeError('Positive sprite cache budget required');
    let bytes = cachedSpriteBytes(cache);
    let evicted = 0;
    while (bytes > budgetBytes && cache.size > 1) {
        const [key, pack] = cache.entries().next().value;
        cache.delete(key);
        bytes -= decodedSpriteBytes(pack);
        evicted++;
        // Do NOT call image.close() or overwrite img.src: avatars/THREE may still
        // reference this image. Dropping the cache reference lets GC reclaim it
        // only when no live renderer does.
    }
    return { bytes, evicted, entries: cache.size, overBudget: bytes > budgetBytes };
}

/** A FIFO decode/fetch permit pool; disposal rejects queued work. */
export class SpriteLoadGate {
    constructor(maxConcurrent = 2) {
        if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) throw new RangeError('Invalid concurrent load count');
        this.limit = maxConcurrent;
        this.active = 0;
        this.queue = [];
        this.closed = false;
        this.highWatermark = 0;
    }

    acquire() {
        if (this.closed) return Promise.reject(new Error('Sprite loader disposed'));
        if (this.active < this.limit) {
            this.active++;
            this.highWatermark = Math.max(this.highWatermark, this.active);
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => this.queue.push({ resolve, reject }));
    }

    release() {
        const next = this.queue.shift();
        if (next && !this.closed) {
            // The permit is transferred: active never briefly decreases.
            next.resolve();
        } else {
            this.active--;
        }
    }

    async run(task) {
        await this.acquire();
        try {
            if (this.closed) throw new Error('Sprite loader disposed');
            return await task();
        } finally {
            this.release();
        }
    }

    dispose() {
        if (this.closed) return;
        this.closed = true;
        for (const task of this.queue.splice(0)) task.reject(new Error('Sprite loader disposed'));
    }

    snapshot() {
        return { active: this.active, queued: this.queue.length,
            maxConcurrent: this.limit, highWatermark: this.highWatermark };
    }
}
