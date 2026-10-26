const mix = (a, b, t) => a + (b - a) * t;
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function captureCharacterStep(entity) {
    const position = entity.position ?? entity.group?.position ?? {};
    entity.previousRenderPose = {
        x: finite(position.x),
        z: finite(position.z),
        jumpHeight: Math.max(0, finite(entity.bodyRoot?.position?.y)),
    };
    entity.animator?.captureStep?.();
}

export function characterRenderPose(entity, alpha = 1) {
    const position = entity.position ?? entity.group?.position ?? {};
    const current = {
        x: finite(position.x),
        z: finite(position.z),
        jumpHeight: Math.max(0, finite(entity.bodyRoot?.position?.y)),
    };
    const previous = entity.previousRenderPose;
    if (!previous || Math.hypot(current.x - previous.x, current.z - previous.z) > 4) return current;
    const t = Number.isFinite(alpha) ? Math.min(1, Math.max(0, alpha)) : 1;
    return {
        x: mix(previous.x, current.x, t),
        z: mix(previous.z, current.z, t),
        jumpHeight: mix(previous.jumpHeight, current.jumpHeight, t),
    };
}
