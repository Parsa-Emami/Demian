/** Shared game-feel rules for every shipped character and both renderers. */
export const CHARACTER_MOVEMENT_SETTINGS = Object.freeze({
    walk_speed: 3.55, run_speed: 6.9, sprint_speed: 7.6,
    jump_force: 6.8, gravity: 17.5, air_control: .58, scale: 1,
});

export const CHARACTER_JUMP_TUNING = Object.freeze({
    bufferSeconds: .14, coyoteSeconds: .11, apexRatio: .18,
    heldApexGravity: .65, releasedRiseGravity: 1.65,
});

export const CHARACTER_STRIDE_LENGTHS = Object.freeze({ walk: 3.4, run: 6, sprint: 6.4 });

export function characterGravity(velocity, force, gravity, held = true) {
    const ratio = Number(velocity) / Math.max(.001, Number(force) || 6.5);
    if (ratio > 0 && held === false) return gravity * CHARACTER_JUMP_TUNING.releasedRiseGravity;
    if (held !== false && Math.abs(ratio) < CHARACTER_JUMP_TUNING.apexRatio) {
        const t = Math.abs(ratio) / CHARACTER_JUMP_TUNING.apexRatio;
        const edge = t * t * (3 - 2 * t);
        return gravity * (CHARACTER_JUMP_TUNING.heldApexGravity
            + (1 - CHARACTER_JUMP_TUNING.heldApexGravity) * edge);
    }
    return gravity;
}

export function isInterruptibleRecovery(state) {
    return ['land', 'skid', 'turn', 'ready', 'blink'].includes(state);
}

/** Separate enter/leave speeds prevent a noisy velocity from flipping clips. */
export function groundLocomotionState(speed, previous = 'idle', {
    walkSpeed = 3.55, runSpeed = 6.9, sprintAllowed = false,
} = {}) {
    const v = Math.max(0, Number(speed) || 0);
    if (sprintAllowed && v > runSpeed * (previous === 'sprint' ? .76 : .86)) return 'sprint';
    if (v > walkSpeed * (['run', 'sprint'].includes(previous) ? 1.15 : 1.32)) return 'run';
    if (v > (previous === 'walk' ? .09 : .16)) return 'walk';
    return 'idle';
}
