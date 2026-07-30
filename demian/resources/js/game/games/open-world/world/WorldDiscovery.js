export default class WorldDiscovery {
    constructor({ discoveredChunks = [], unlockedSavePoints = [] } = {}) {
        this.discoveredChunks = new Set(discoveredChunks.map(String));
        this.unlockedSavePoints = new Set(unlockedSavePoints.map(String));
    }

    discoverChunk(chunkId) {
        const before = this.discoveredChunks.size;
        this.discoveredChunks.add(String(chunkId));
        return this.discoveredChunks.size !== before;
    }

    unlockSavePoint(savePointId) {
        const before = this.unlockedSavePoints.size;
        this.unlockedSavePoints.add(String(savePointId));
        return this.unlockedSavePoints.size !== before;
    }

    isChunkDiscovered(chunkId) { return this.discoveredChunks.has(String(chunkId)); }
    isSavePointUnlocked(savePointId) { return this.unlockedSavePoints.has(String(savePointId)); }

    import(snapshot = {}) {
        this.discoveredChunks = new Set((snapshot.discoveredChunks ?? []).map(String));
        this.unlockedSavePoints = new Set((snapshot.unlockedSavePoints ?? []).map(String));
    }

    export() {
        return Object.freeze({
            discoveredChunks: Object.freeze([...this.discoveredChunks].sort()),
            unlockedSavePoints: Object.freeze([...this.unlockedSavePoints].sort()),
        });
    }
}
