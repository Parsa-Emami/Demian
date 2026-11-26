import { RECORD_GAMES } from '../leaderboard/GameRecord.js';

// Opt-in, in-memory QA metrics for *actual* playtests. No network, account
// identity, input trace, phone, IP, score, client token or persistent storage.
const known = new Set(RECORD_GAMES);
const fresh = () => ({ starts: 0, completions: 0, wins: 0, exits: 0,
    retries: 0, droppedFrameSeconds: 0, elapsedSessionMs: 0 });
const safeTime = clock => {
    const time = clock();
    return Number.isFinite(time) && time >= 0 ? time : 0;
};

export default class GameplayQualityProbe {
    constructor({ eventBus, clock = () => globalThis.performance?.now?.() ?? Date.now() }) {
        this.clock = clock;
        this.stats = new Map(RECORD_GAMES.map(id => [id, fresh()]));
        this.session = null;
        this.lastCompleted = null;
        this.unsubscribers = [
            eventBus.on('game:session-started', ({ gameId } = {}) => {
                if (!known.has(gameId)) return;
                const counter = this.stats.get(gameId);
                counter.starts++;
                if (this.lastCompleted === gameId) counter.retries++;
                this.session = { gameId, at: safeTime(this.clock) };
                this.lastCompleted = null;
            }),
            eventBus.on('game:completed', ({ gameId, won } = {}) => {
                if (!known.has(gameId)) return;
                const counter = this.stats.get(gameId);
                counter.completions++;
                counter.wins += Number(won === true);
                this.finishElapsed(gameId);
                this.lastCompleted = gameId;
            }),
            eventBus.on('game:exited', ({ gameId } = {}) => {
                if (!known.has(gameId)) return;
                this.stats.get(gameId).exits++;
                this.finishElapsed(gameId);
                this.lastCompleted = null;
            }),
            eventBus.on('runtime:frame-drop', ({ droppedSeconds } = {}) => {
                const gameId = this.session?.gameId;
                if (!known.has(gameId) || !Number.isFinite(droppedSeconds)
                    || droppedSeconds <= 0) return;
                const counter = this.stats.get(gameId);
                counter.droppedFrameSeconds += Math.min(droppedSeconds, 1);
            }),
        ];
    }

    finishElapsed(gameId) {
        if (this.session?.gameId !== gameId) return;
        this.stats.get(gameId).elapsedSessionMs += Math.min(
            Math.max(0, safeTime(this.clock) - this.session.at), 3600000);
        this.session = null;
    }

    snapshot() {
        return Object.freeze(Object.fromEntries([...this.stats].map(([id, stats]) =>
            [id, Object.freeze({ ...stats,
                // Ratios only from completed real sessions; do not extrapolate.
                observedWinRate: stats.completions ? stats.wins / stats.completions : null,
            })])));
    }

    dispose() {
        for (const unsub of this.unsubscribers) unsub();
        this.unsubscribers = [];
        this.session = null;
    }
}
