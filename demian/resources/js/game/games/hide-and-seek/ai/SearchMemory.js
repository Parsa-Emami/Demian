export default class SearchMemory {
    constructor({ memorySeconds = 5.5 } = {}) {
        this.memorySeconds = Math.max(0.1, Number(memorySeconds) || 5.5);
        this.lastSeen = new Map();
        this.suspiciousZones = new Map();
        this.checkedHideSpots = new Map();
    }

    rememberSeen(actorId, position, time) {
        this.lastSeen.set(String(actorId), { position: { x: position.x, z: position.z }, time });
    }

    rememberSuspicion(id, position, time, weight = 1) {
        this.suspiciousZones.set(String(id), { position: { x: position.x, z: position.z }, time, weight });
    }

    markHideSpotChecked(spotId, time) {
        this.checkedHideSpots.set(String(spotId), time);
    }

    recentSeen(now) {
        return [...this.lastSeen.entries()]
            .map(([actorId, entry]) => ({ actorId, ...entry, age: now - entry.time }))
            .filter((entry) => entry.age <= this.memorySeconds)
            .sort((a, b) => a.age - b.age);
    }

    nextSuspicious(now) {
        return [...this.suspiciousZones.entries()]
            .map(([id, entry]) => ({ id, ...entry, age: now - entry.time }))
            .filter((entry) => entry.age <= this.memorySeconds * 1.5)
            .sort((a, b) => b.weight - a.weight || a.age - b.age)[0] ?? null;
    }

    shouldCheckSpot(spotId, now, cooldownSeconds = 8) {
        return now - (this.checkedHideSpots.get(String(spotId)) ?? -Infinity) >= cooldownSeconds;
    }

    prune(now) {
        const limit = this.memorySeconds * 2;
        this.lastSeen.forEach((entry, key) => { if (now - entry.time > limit) this.lastSeen.delete(key); });
        this.suspiciousZones.forEach((entry, key) => { if (now - entry.time > limit) this.suspiciousZones.delete(key); });
    }
}
