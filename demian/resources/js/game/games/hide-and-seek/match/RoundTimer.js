export default class RoundTimer {
    constructor(durationSeconds = 0) {
        this.duration = 0;
        this.elapsed = 0;
        this.running = false;
        this.reset(durationSeconds);
    }

    reset(durationSeconds = this.duration, { running = false } = {}) {
        this.duration = Math.max(0, Number(durationSeconds) || 0);
        this.elapsed = 0;
        this.running = Boolean(running);
        return this;
    }

    start() {
        this.running = true;
        return this;
    }

    stop() {
        this.running = false;
        return this;
    }

    tick(deltaTime) {
        if (!this.running || this.expired) return this.remaining;
        this.elapsed = Math.min(this.duration, this.elapsed + Math.max(0, Number(deltaTime) || 0));
        if (this.expired) this.running = false;
        return this.remaining;
    }

    get remaining() {
        return Math.max(0, this.duration - this.elapsed);
    }

    get progress() {
        return this.duration <= 0 ? 1 : Math.min(1, this.elapsed / this.duration);
    }

    get expired() {
        return this.remaining <= 0;
    }

    snapshot() {
        return Object.freeze({
            duration: this.duration,
            elapsed: this.elapsed,
            remaining: this.remaining,
            progress: this.progress,
            running: this.running,
            expired: this.expired,
        });
    }
}
