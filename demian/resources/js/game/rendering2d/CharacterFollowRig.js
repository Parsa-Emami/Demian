function clamp(value, limit) { return Math.max(-limit, Math.min(limit, value)); }
export default class CharacterFollowRig {
    constructor() { this.reset(); }
    reset(position = null) { this.previous = position ? { x: position.x, z: position.z } : null; this.anchor = this.previous ? { ...this.previous } : null; this.lead = { x: 0, z: 0 }; }
    sample(position, dt, { reducedMotion = false } = {}) {
        const point = { x: Number(position?.x) || 0, z: Number(position?.z) || 0 };
        const teleported = this.previous && Math.hypot(point.x - this.previous.x, point.z - this.previous.z) > 8;
        if (!this.previous || teleported) { this.reset(point); return { ...point, immediate: true }; }
        const delta = Math.max(0, Math.min(.1, dt)); if (!delta) return { ...this.anchor, immediate: false };
        const alpha = 1 - Math.exp(-6 * delta);
        for (const axis of ['x', 'z']) {
            const desired = reducedMotion ? 0 : clamp((point[axis] - this.previous[axis]) / delta * .16, 1.1);
            this.lead[axis] += (desired - this.lead[axis]) * alpha;
            const focus = point[axis] + this.lead[axis], deadzone = axis === 'x' ? .5 : .35;
            this.anchor[axis] = focus - clamp(focus - this.anchor[axis], deadzone);
        }
        this.previous = point; return { ...this.anchor, immediate: false };
    }
}
