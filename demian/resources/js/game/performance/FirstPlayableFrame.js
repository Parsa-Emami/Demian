export default class FirstPlayableFrame {
    constructor() {
        this.sequence = 0;
        this.last = null;
        this.pending = null;
    }
    start(gameId, startedAt) {
        this.last = null;
        this.pending = { gameId, startedAt, sequence: ++this.sequence, game: null };
    }
    arm(game, presentedFrames) {
        if (this.pending && Number.isSafeInteger(presentedFrames)) Object.assign(this.pending, { game, presentedFrames });
    }
    observe({ game, timestamp, playing, loaderHidden, presentedFrames }) {
        const pending = this.pending;
        if (!pending?.game || game !== pending.game || !playing || !loaderHidden
            || !Number.isFinite(timestamp) || timestamp < pending.startedAt
            || !Number.isSafeInteger(presentedFrames) || presentedFrames <= pending.presentedFrames) return null;
        this.pending = null;
        this.last = Object.freeze({ gameId: pending.gameId, sequence: pending.sequence,
            durationMs: Math.round((timestamp - pending.startedAt) * 10) / 10 });
        return this.last;
    }
    clear() {
        this.pending = null;
        this.last = null;
    }
}
