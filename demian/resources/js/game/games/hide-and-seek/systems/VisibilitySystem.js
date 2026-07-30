function normalized(value, fallback = { x: 0, z: 1 }) {
    const x = Number(value?.x) || 0;
    const z = Number(value?.z) || 0;
    const length = Math.hypot(x, z);
    return length > 0.0001 ? { x: x / length, z: z / length } : fallback;
}

function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
}

export default class VisibilitySystem {
    constructor({ range = 12, fieldOfViewDegrees = 100, revealThreshold = 0.52, hiddenRevealThreshold = 0.8 } = {}) {
        this.range = Math.max(0.1, Number(range) || 12);
        this.cosHalfFov = Math.cos((Math.max(1, Math.min(359, Number(fieldOfViewDegrees) || 100)) * Math.PI / 180) / 2);
        this.revealThreshold = clamp01(revealThreshold);
        this.hiddenRevealThreshold = clamp01(hiddenRevealThreshold);
    }

    evaluate(observer, target, {
        raycast = null,
        exclude = [],
        lightLevel = 1,
        movementSpeed = 0,
        concealment = 0,
    } = {}) {
        const dx = target.position.x - observer.position.x;
        const dz = target.position.z - observer.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance > this.range) return this.result(false, 'range', distance, -1, 0, false);

        const direction = distance > 0.0001 ? { x: dx / distance, z: dz / distance } : { x: 0, z: 1 };
        const forward = normalized(observer.forward);
        const facing = forward.x * direction.x + forward.z * direction.z;
        if (facing < this.cosHalfFov) return this.result(false, 'fov', distance, facing, 0, false);

        const hit = raycast?.(observer.position, target.position, { exclude });
        const occluded = Boolean(hit && hit.fraction < 0.97);
        if (occluded) return this.result(false, 'occluded', distance, facing, 0, true);

        const distanceFactor = 1 - distance / this.range;
        const facingFactor = (facing - this.cosHalfFov) / Math.max(0.0001, 1 - this.cosHalfFov);
        const movementFactor = clamp01(movementSpeed / 6);
        const illumination = 0.35 + clamp01(lightLevel) * 0.65;
        const concealmentPenalty = clamp01(concealment) * 0.72;
        const score = clamp01((distanceFactor * 0.46 + facingFactor * 0.32 + movementFactor * 0.22) * illumination - concealmentPenalty);
        const threshold = concealment > 0 ? this.hiddenRevealThreshold : this.revealThreshold;
        return this.result(score >= threshold, score >= threshold ? 'visible' : 'concealed', distance, facing, score, false);
    }

    result(visible, reason, distance, facing, score, occluded) {
        return Object.freeze({ visible, reason, distance, facing, score, occluded });
    }
}
