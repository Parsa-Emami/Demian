const REPLAY_VERSION = 1;

function normalizeInput(input = {}) {
    return Object.fromEntries(
        Object.entries(input)
            .filter(([, value]) => value === true || (typeof value === 'number' && value !== 0))
            .sort(([a], [b]) => a.localeCompare(b))
    );
}

export default class ReplayRecorder {
    constructor({ seed, fixedStep = 1 / 60 } = {}) {
        this.seed = seed;
        this.fixedStep = fixedStep;
        this.events = [];
        this.lastSignature = null;
    }

    record(tick, input) {
        const normalized = normalizeInput(input);
        const signature = JSON.stringify(normalized);
        if (signature === this.lastSignature) return;

        this.events.push(Object.freeze({ tick, input: Object.freeze(normalized) }));
        this.lastSignature = signature;
    }

    export(metadata = {}) {
        return Object.freeze({
            version: REPLAY_VERSION,
            seed: this.seed,
            fixedStep: this.fixedStep,
            events: Object.freeze(this.events.map((event) => ({
                tick: event.tick,
                input: { ...event.input },
            }))),
            metadata: Object.freeze({ ...metadata }),
        });
    }
}

export { REPLAY_VERSION };
