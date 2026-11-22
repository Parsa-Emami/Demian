/**
 * Opt-in touch diagnostics. Never influences InputRouter/game commands.
 * Tracks pointercancel, simultaneous touches and a bounded move sample;
 * resets on lifecycle transitions so vanished pointers are not "held" forever.
 */
export default class TouchQaTracker {
    constructor({ moveThrottleMs = 75 } = {}) {
        this.moveThrottleMs = moveThrottleMs;
        this.reset();
    }
    reset() {
        this.active = new Map();
        this.pointerDowns = 0;
        this.pointerUps = 0;
        this.pointerCancels = 0;
        this.orphans = 0;
        this.moveSamples = 0;
        this.movesSkipped = 0;
        this.peakTouches = 0;
        this.lifecycleCleared = 0;
    }
    boundary() {
        this.lifecycleCleared += this.active.size;
        this.active.clear();
    }
    observe(type, pointerId, time) {
        if (!Number.isSafeInteger(pointerId) || !Number.isFinite(time) || time < 0) return false;
        if (type === 'pointerdown') {
            this.pointerDowns++;
            this.active.set(pointerId,{lastSample:time});
            this.peakTouches=Math.max(this.peakTouches,this.active.size);
            return true;
        }
        if (type === 'pointermove') {
            const item=this.active.get(pointerId);
            if (!item) return false;
            if (time - item.lastSample < this.moveThrottleMs) {
                this.movesSkipped++; return false;
            }
            item.lastSample=time;
            this.moveSamples++;
            return true;
        }
        if (type === 'pointerup' || type === 'pointercancel') {
            if (type === 'pointerup') this.pointerUps++;
            else this.pointerCancels++;
            if (!this.active.delete(pointerId)) this.orphans++;
            return type === 'pointerup';
        }
        return false;
    }
    snapshot() {
        return Object.freeze({
            pointerDowns:this.pointerDowns,pointerUps:this.pointerUps,
            pointerCancels:this.pointerCancels,orphanTerminals:this.orphans,
            peakSimultaneousTouches:this.peakTouches,activeTouches:this.active.size,
            sampledMoves:this.moveSamples,skippedHighFrequencyMoves:this.movesSkipped,
            clearedAtLifecycle:this.lifecycleCleared,
            note:'DOM event-to-frame-submission is not true touch-to-photon latency.',
        });
    }
}
