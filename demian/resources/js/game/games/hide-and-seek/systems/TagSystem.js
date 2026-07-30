export default class TagSystem {
    constructor({ distance = 1.35, cooldownSeconds = 0.45 } = {}) {
        this.distance = Math.max(0.1, Number(distance) || 1.35);
        this.cooldownSeconds = Math.max(0, Number(cooldownSeconds) || 0);
        this.cooldowns = new Map();
    }

    update(deltaTime) {
        const dt = Math.max(0, Number(deltaTime) || 0);
        this.cooldowns.forEach((remaining, actorId) => {
            const next = Math.max(0, remaining - dt);
            if (next === 0) this.cooldowns.delete(actorId);
            else this.cooldowns.set(actorId, next);
        });
    }

    canTag(seeker, hider, { visible = true } = {}) {
        if (!seeker || !hider || seeker.eliminated || hider.eliminated || !visible) return false;
        if (this.cooldowns.has(seeker.id)) return false;
        return Math.hypot(seeker.position.x - hider.position.x, seeker.position.z - hider.position.z) <= this.distance;
    }

    tag(seeker, hider, options = {}) {
        if (!this.canTag(seeker, hider, options)) return false;
        this.cooldowns.set(seeker.id, this.cooldownSeconds);
        return true;
    }

    reset() {
        this.cooldowns.clear();
    }
}
