const DEFAULT_BANDS = Object.freeze([
    Object.freeze({ id: 'near', maxDistance: 18, hz: 30, render: true, simulateOnly: false }),
    Object.freeze({ id: 'visible', maxDistance: 42, hz: 15, render: true, simulateOnly: false }),
    Object.freeze({ id: 'distant', maxDistance: 78, hz: 5, render: true, simulateOnly: false }),
    Object.freeze({ id: 'dormant', maxDistance: Infinity, hz: 1, render: false, simulateOnly: true }),
]);

export default class AiBudgetScheduler {
    constructor({ bands = DEFAULT_BANDS, maxUpdatesPerFrame = 8 } = {}) {
        this.bands = Object.freeze(bands.map((band) => Object.freeze({ ...band })));
        this.maxUpdatesPerFrame = Math.max(1, Math.floor(maxUpdatesPerFrame));
        this.records = new Map();
        this.frameUpdates = 0;
        this.statsByBand = Object.fromEntries(this.bands.map((band) => [band.id, 0]));
    }

    beginFrame() {
        this.frameUpdates = 0;
        Object.keys(this.statsByBand).forEach((key) => { this.statsByBand[key] = 0; });
    }

    bandFor(distance, visible = true) {
        const resolved = Math.max(0, Number(distance) || 0);
        const band = this.bands.find((candidate) => resolved <= candidate.maxDistance) ?? this.bands.at(-1);
        if (!visible && band.id === 'visible') return this.bands.find((candidate) => candidate.id === 'distant') ?? band;
        return band;
    }

    take(id, deltaTime, distance, { visible = true, priority = 0 } = {}) {
        const key = String(id);
        const band = this.bandFor(distance, visible);
        const record = this.records.get(key) ?? { accumulator: 0, bandId: band.id, skipped: 0 };
        if (record.bandId !== band.id) {
            record.bandId = band.id;
            record.accumulator = Math.min(record.accumulator, 1 / band.hz);
        }
        record.accumulator += Math.max(0, Number(deltaTime) || 0);
        const interval = 1 / band.hz;
        const due = record.accumulator + Number.EPSILON >= interval;
        const hasBudget = this.frameUpdates < this.maxUpdatesPerFrame || priority > 0;
        if (due && hasBudget) {
            const elapsed = record.accumulator;
            record.accumulator = 0;
            record.skipped = 0;
            this.frameUpdates += 1;
            this.statsByBand[band.id] += 1;
            this.records.set(key, record);
            return Object.freeze({ update: true, deltaTime: elapsed, band: band.id, render: band.render, simulateOnly: band.simulateOnly });
        }
        if (due) record.skipped += 1;
        this.records.set(key, record);
        return Object.freeze({ update: false, deltaTime: 0, band: band.id, render: band.render, simulateOnly: band.simulateOnly });
    }

    remove(id) { return this.records.delete(String(id)); }
    clear() { this.records.clear(); }
    stats() { return Object.freeze({ tracked: this.records.size, frameUpdates: this.frameUpdates, byBand: Object.freeze({ ...this.statsByBand }) }); }
}
