export const IMPULSE_ACTIONS = Object.freeze({
    dash: Object.freeze({ duration: .42, speed: 12.8, reverse: false }),
    slide: Object.freeze({ duration: .58, speed: 9.7, reverse: false }),
    dodge: Object.freeze({ duration: .62, speed: 8.8, reverse: true }),
});
export default class CharacterActionBuffer {
    constructor(seconds = .16) { this.seconds = seconds; this.action = null; this.remaining = 0; }
    update(dt) { this.remaining = Math.max(0, this.remaining - Math.max(0, dt)); if (!this.remaining) this.action = null; }
    push(action) { this.action = action; this.remaining = this.seconds; }
    take(ready) {
        if (!ready || !this.action || !this.remaining) return null;
        const action = this.action; this.clear(); return action;
    }
    clear() { this.action = null; this.remaining = 0; }
}
