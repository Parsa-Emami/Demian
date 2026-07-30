const STORAGE_KEY = 'demian.hide-and-seek.stats.v1';
const DEFAULT_STATS = Object.freeze({
    version: 1,
    matches: 0,
    wins: 0,
    hiderWins: 0,
    seekerWins: 0,
    bestScore: 0,
    totalTags: 0,
    longestSurvivalSeconds: 0,
});

function normalized(payload = {}) {
    return {
        ...DEFAULT_STATS,
        ...Object.fromEntries(Object.entries(DEFAULT_STATS).map(([key, fallback]) => [
            key,
            key === 'version' ? 1 : Math.max(0, Number(payload[key]) || fallback),
        ])),
    };
}

export default class HideAndSeekStatsStore {
    constructor({ storage = typeof localStorage !== 'undefined' ? localStorage : null } = {}) {
        this.storage = storage;
        this.state = this.load();
    }

    load() {
        if (!this.storage) return { ...DEFAULT_STATS };
        try {
            return normalized(JSON.parse(this.storage.getItem(STORAGE_KEY) ?? '{}'));
        } catch {
            return { ...DEFAULT_STATS };
        }
    }

    commit(result = {}) {
        const won = Boolean(result.won);
        const role = result.role;
        this.state.matches += 1;
        this.state.wins += Number(won);
        if (won && role === 'hider') this.state.hiderWins += 1;
        if (won && role === 'seeker') this.state.seekerWins += 1;
        this.state.bestScore = Math.max(this.state.bestScore, Math.max(0, Number(result.score) || 0));
        this.state.totalTags += Math.max(0, Number(result.tags) || 0);
        this.state.longestSurvivalSeconds = Math.max(this.state.longestSurvivalSeconds, Math.max(0, Number(result.survivalSeconds) || 0));
        this.persist();
        return this.snapshot();
    }

    persist() {
        try { this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch { /* storage is optional */ }
    }

    snapshot() {
        return Object.freeze({ ...this.state });
    }
}
