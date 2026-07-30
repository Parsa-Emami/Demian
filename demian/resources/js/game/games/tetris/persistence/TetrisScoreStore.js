const STORAGE_KEY = 'demian:tetris:profile';
const VERSION = 1;
const DEFAULT_PROFILE = Object.freeze({
    version: VERSION,
    highScore: 0,
    bestLines: 0,
    bestLevel: 1,
    gamesPlayed: 0,
    totalLines: 0,
});

function normalize(value = {}) {
    return {
        version: VERSION,
        highScore: Math.max(0, Math.floor(Number(value.highScore) || 0)),
        bestLines: Math.max(0, Math.floor(Number(value.bestLines) || 0)),
        bestLevel: Math.max(1, Math.floor(Number(value.bestLevel) || 1)),
        gamesPlayed: Math.max(0, Math.floor(Number(value.gamesPlayed) || 0)),
        totalLines: Math.max(0, Math.floor(Number(value.totalLines) || 0)),
    };
}

export default class TetrisScoreStore {
    constructor({ storage = typeof localStorage !== 'undefined' ? localStorage : null, key = STORAGE_KEY } = {}) {
        this.storage = storage;
        this.key = key;
        this.profile = this.load();
    }

    load() {
        if (!this.storage) return { ...DEFAULT_PROFILE };
        try {
            const raw = JSON.parse(this.storage.getItem(this.key) ?? 'null');
            return normalize(raw ?? DEFAULT_PROFILE);
        } catch {
            return { ...DEFAULT_PROFILE };
        }
    }

    snapshot() {
        return Object.freeze({ ...this.profile });
    }

    commitSession({ score = 0, lines = 0, level = 1 } = {}) {
        const previousHighScore = this.profile.highScore;
        this.profile = normalize({
            ...this.profile,
            highScore: Math.max(this.profile.highScore, score),
            bestLines: Math.max(this.profile.bestLines, lines),
            bestLevel: Math.max(this.profile.bestLevel, level),
            gamesPlayed: this.profile.gamesPlayed + 1,
            totalLines: this.profile.totalLines + lines,
        });
        this.persist();
        return Object.freeze({
            profile: this.snapshot(),
            isNewHighScore: score > previousHighScore,
        });
    }

    persist() {
        if (!this.storage) return;
        try {
            this.storage.setItem(this.key, JSON.stringify(this.profile));
        } catch {
            // Storage is optional; gameplay remains available in private mode.
        }
    }
}
