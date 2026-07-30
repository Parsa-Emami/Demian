const VERSION = 1;
const KEY = 'demian:event-rewards:v1';
const DEFAULT_STATE = Object.freeze({
    version: VERSION,
    wallet: Object.freeze({ coin: 0, xp: 0 }),
    badges: Object.freeze([]),
    cosmetics: Object.freeze([]),
    history: Object.freeze([]),
});

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

export default class EventRewardStore {
    constructor({ storage = globalThis.localStorage, key = KEY } = {}) {
        this.storage = storage;
        this.key = key;
        this.state = this.load();
    }

    load() {
        try {
            const raw = this.storage?.getItem(this.key);
            if (!raw) return clone(DEFAULT_STATE);
            const parsed = JSON.parse(raw);
            if (parsed.version !== VERSION) throw new Error('Unsupported reward store version.');
            return {
                version: VERSION,
                wallet: {
                    coin: Math.max(0, Number(parsed.wallet?.coin) || 0),
                    xp: Math.max(0, Number(parsed.wallet?.xp) || 0),
                },
                badges: [...new Set(parsed.badges ?? [])],
                cosmetics: [...new Set(parsed.cosmetics ?? [])],
                history: Array.isArray(parsed.history) ? parsed.history.slice(-50) : [],
            };
        } catch {
            return clone(DEFAULT_STATE);
        }
    }

    commit(receipt) {
        if (!receipt?.id) throw new TypeError('Reward receipt id is required.');
        if (this.state.history.some((entry) => entry.id === receipt.id)) {
            return Object.freeze({ applied: false, state: this.snapshot() });
        }

        this.state.wallet.coin += receipt.totals?.coin ?? 0;
        this.state.wallet.xp += receipt.totals?.xp ?? 0;
        this.state.badges = [...new Set([...this.state.badges, ...(receipt.unlocks?.badges ?? [])])];
        this.state.cosmetics = [...new Set([...this.state.cosmetics, ...(receipt.unlocks?.cosmetics ?? [])])];
        this.state.history.push({
            id: receipt.id,
            eventId: receipt.eventId,
            score: receipt.score,
            successful: receipt.successful,
            at: new Date().toISOString(),
        });
        this.state.history = this.state.history.slice(-50);
        this.persist();
        return Object.freeze({ applied: true, state: this.snapshot() });
    }

    persist() {
        try {
            this.storage?.setItem(this.key, JSON.stringify(this.state));
        } catch {
            // Storage is an optional progressive enhancement.
        }
    }

    snapshot() {
        return Object.freeze(clone(this.state));
    }
}
