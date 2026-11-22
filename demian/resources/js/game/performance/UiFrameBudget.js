/**
 * Pure presentation-throttling policy. Never gates fixed simulation, input,
 * collisions, ranked timers, replay actions, or result submission.
 * Caps expensive HUD/minimap DOM updates while the world continues rendering.
 */
export default class UiFrameBudget {
    constructor({ refreshHz = 15 } = {}) {
        if (!Number.isFinite(refreshHz) || refreshHz < 1 || refreshHz > 60) {
            throw new RangeError('UI refresh rate must be between 1 and 60 Hz');
        }
        this.interval = 1 / refreshHz;
        this.elapsed = this.interval;
        this.updates = 0;
        this.skipped = 0;
    }

    shouldRefresh(deltaSeconds, { force = false } = {}) {
        if (force) {
            this.elapsed = 0;
            this.updates++;
            return true;
        }
        if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) return false;
        // A background/resume gap must not cause a burst of UI updates.
        this.elapsed = Math.min(this.interval, this.elapsed + Math.min(.1, deltaSeconds));
        if (this.elapsed + 1e-9 < this.interval) {
            this.skipped++;
            return false;
        }
        this.elapsed = 0;
        this.updates++;
        return true;
    }

    reset() { this.elapsed = this.interval; }

    snapshot() {
        return Object.freeze({ intervalMs: 1000 * this.interval,
            updates: this.updates, skipped: this.skipped });
    }
}
