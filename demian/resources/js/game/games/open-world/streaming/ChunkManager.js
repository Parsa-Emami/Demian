const TIER_RANK = Object.freeze({ active: 0, dormant: 1 });

function taskKey(chunkId) {
    return String(chunkId);
}

export default class ChunkManager {
    constructor({
        manifest,
        partition,
        loader,
        unloader,
        eventBus = null,
        activeRadius = 1,
        preloadRadius = 2,
        maxLoadedChunks = 14,
        concurrency = 2,
    } = {}) {
        if (!manifest || !partition || !loader || !unloader) throw new TypeError('ChunkManager requires manifest, partition, loader and unloader.');
        this.manifest = manifest;
        this.partition = partition;
        this.loader = loader;
        this.unloader = unloader;
        this.eventBus = eventBus;
        this.activeRadius = Math.max(0, Math.floor(activeRadius));
        this.preloadRadius = Math.max(this.activeRadius, Math.floor(preloadRadius));
        this.maxLoadedChunks = Math.max(1, Math.floor(maxLoadedChunks));
        this.concurrency = Math.max(1, Math.floor(concurrency));
        this.loaded = new Map();
        this.loading = new Map();
        this.queue = new Map();
        this.target = new Map();
        this.running = 0;
        this.disposed = false;
        this.sequence = 0;
        this.idleWaiters = new Set();
        this.currentChunkId = null;
    }

    desired(position) {
        const entries = this.partition.chunksWithin(position, this.preloadRadius);
        return new Map(entries.map(({ chunk, distance }) => [chunk.id, {
            definition: chunk,
            distance,
            tier: distance <= this.activeRadius ? 'active' : 'dormant',
        }]));
    }

    update(position) {
        if (this.disposed) return this.stats();
        const desired = [...this.desired(position).entries()]
            .sort(([, left], [, right]) => (TIER_RANK[left.tier] - TIER_RANK[right.tier]) || (left.distance - right.distance))
            .slice(0, this.maxLoadedChunks);
        this.target = new Map(desired);
        const current = this.partition.chunkAt(position);
        if (current?.id !== this.currentChunkId) {
            const previousChunkId = this.currentChunkId;
            this.currentChunkId = current?.id ?? null;
            this.eventBus?.emit('world:chunk-entered', { chunk: current, previousChunkId });
        }

        for (const [chunkId, target] of this.target) {
            const loaded = this.loaded.get(chunkId);
            if (loaded) {
                this.applyTier(loaded, target.tier);
                loaded.lastTouched = ++this.sequence;
                loaded.distance = target.distance;
                continue;
            }
            const loading = this.loading.get(chunkId);
            if (loading) {
                loading.tier = target.tier;
                loading.distance = target.distance;
                continue;
            }
            this.queue.set(taskKey(chunkId), {
                definition: target.definition,
                tier: target.tier,
                distance: target.distance,
                sequence: ++this.sequence,
            });
        }

        for (const [chunkId, loading] of this.loading) {
            if (!this.target.has(chunkId)) {
                loading.controller.abort();
            }
        }
        for (const chunkId of [...this.queue.keys()]) {
            if (!this.target.has(chunkId)) this.queue.delete(chunkId);
        }
        this.evictOutsideTarget();
        this.enforceBudget();
        this.pump();
        return this.stats();
    }

    applyTier(record, tier) {
        if (record.tier === tier) return;
        record.tier = tier;
        record.handle?.setTier?.(tier);
        this.eventBus?.emit('world:chunk-tier-changed', { chunkId: record.definition.id, tier });
    }

    pump() {
        if (this.disposed) return;
        while (this.running < this.concurrency && this.queue.size > 0) {
            const tasks = [...this.queue.values()].sort((a, b) =>
                (TIER_RANK[a.tier] - TIER_RANK[b.tier]) ||
                (a.distance - b.distance) ||
                (a.sequence - b.sequence)
            );
            const task = tasks[0];
            this.queue.delete(task.definition.id);
            this.start(task);
        }
        this.resolveIdleIfNeeded();
    }

    async start(task) {
        const chunkId = task.definition.id;
        const controller = new AbortController();
        const record = { ...task, controller };
        this.loading.set(chunkId, record);
        this.running += 1;
        try {
            const handle = await this.loader.load(task.definition, { signal: controller.signal, tier: task.tier });
            if (this.disposed || controller.signal.aborted || !this.target.has(chunkId)) {
                await this.unloader.unload(handle, task.definition);
                return;
            }
            const target = this.target.get(chunkId);
            const loaded = {
                definition: task.definition,
                handle,
                tier: target.tier,
                distance: target.distance,
                loadedAt: Date.now(),
                lastTouched: ++this.sequence,
            };
            handle?.setTier?.(target.tier);
            this.loaded.set(chunkId, loaded);
            this.enforceBudget();
        } catch (error) {
            if (error?.name !== 'AbortError') {
                this.eventBus?.emit('world:chunk-load-failed', { chunkId, error });
            }
        } finally {
            this.loading.delete(chunkId);
            this.running = Math.max(0, this.running - 1);
            this.pump();
        }
    }

    evictOutsideTarget() {
        for (const [chunkId, record] of [...this.loaded]) {
            if (!this.target.has(chunkId)) this.unloadRecord(chunkId, record);
        }
    }

    enforceBudget() {
        if (this.loaded.size <= this.maxLoadedChunks) return;
        const candidates = [...this.loaded.entries()]
            .filter(([chunkId]) => chunkId !== this.currentChunkId)
            .sort(([, a], [, b]) =>
                (TIER_RANK[b.tier] - TIER_RANK[a.tier]) ||
                (b.distance - a.distance) ||
                (a.lastTouched - b.lastTouched)
            );
        while (this.loaded.size > this.maxLoadedChunks && candidates.length > 0) {
            const [chunkId, record] = candidates.shift();
            this.unloadRecord(chunkId, record);
        }
    }

    unloadRecord(chunkId, record) {
        if (!this.loaded.delete(chunkId)) return;
        Promise.resolve(this.unloader.unload(record.handle, record.definition)).catch((error) => {
            this.eventBus?.emit('world:chunk-unload-failed', { chunkId, error });
        }).finally(() => this.resolveIdleIfNeeded());
    }

    async ensureAround(position) {
        this.update(position);
        await this.whenIdle();
        const current = this.partition.chunkAt(position);
        return current ? this.loaded.get(current.id)?.handle ?? null : null;
    }

    whenIdle() {
        if (this.running === 0 && this.queue.size === 0) return Promise.resolve();
        return new Promise((resolve) => this.idleWaiters.add(resolve));
    }

    resolveIdleIfNeeded() {
        if (this.running !== 0 || this.queue.size !== 0) return;
        this.idleWaiters.forEach((resolve) => resolve());
        this.idleWaiters.clear();
    }

    stats() {
        let active = 0;
        let dormant = 0;
        this.loaded.forEach((record) => { if (record.tier === 'active') active += 1; else dormant += 1; });
        return Object.freeze({
            loaded: this.loaded.size,
            active,
            dormant,
            loading: this.loading.size,
            queued: this.queue.size,
            currentChunkId: this.currentChunkId,
            maxLoadedChunks: this.maxLoadedChunks,
        });
    }

    async dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.queue.clear();
        this.loading.forEach((record) => record.controller.abort());
        const unloads = [...this.loaded.entries()].map(([chunkId, record]) => {
            this.loaded.delete(chunkId);
            return this.unloader.unload(record.handle, record.definition);
        });
        await Promise.allSettled(unloads);
        this.target.clear();
        this.resolveIdleIfNeeded();
        this.eventBus = null;
    }
}
