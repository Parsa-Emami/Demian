function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
}

function directionDepth(direction) {
    const value = String(direction ?? 'e');
    return value.includes('n') ? -1 : value.includes('s') ? 1 : 0;
}

function directionHorizontal(direction) {
    const value = String(direction ?? 'e');
    return value.includes('w') ? -1 : value.includes('e') ? 1 : 0;
}

export const CHARACTER_LOCOMOTION_STATES = Object.freeze([
    'idle',
    'breathe',
    'blink',
    'ready',
    'walk',
    'tiptoe',
    'run',
    'sprint',
    'takeoff',
    'jump',
    'hop',
    'hover',
    'fall',
    'land',
    'skid',
    'dash',
    'slide',
    'dodge',
    'turn',
]);

export function characterPlaybackRate(state, movementRatio = 0) {
    const ratio = clamp(movementRatio, 0, 1.6);
    if (state === 'walk' || state === 'tiptoe') {
        return 0.82 + Math.min(1, ratio) * 0.52;
    }
    if (state === 'run' || state === 'sprint') {
        return 0.88 + Math.min(1.2, ratio) * 0.38;
    }
    return 1;
}

export function characterPresentationPose({
    state = 'idle',
    presentationTime = 0,
    stateTime = 0,
    progress = 0,
    direction = 'e',
    facing = 1,
    jumpVelocity = 0,
    jumpForce = 1,
    velocityX = 0,
    depthMotion = null,
    horizontalMotion = null,
} = {}) {
    const time = Number(presentationTime) || 0;
    const localTime = Number(stateTime) || 0;
    const phase = clamp(progress, 0, 1);
    const depthValue = Number(depthMotion);
    const horizontalValue = Number(horizontalMotion);
    const depth = Number.isFinite(depthValue) ? clamp(depthValue, -1, 1) : directionDepth(direction);
    const horizontal = Number.isFinite(horizontalValue) ? clamp(horizontalValue, -1, 1) : directionHorizontal(direction);
    const target = { width: 1, height: 1, bob: 0, tilt: 0, x: 0, y: 0 };

    if (['idle', 'breathe', 'blink', 'ready'].includes(state)) {
        const breath = Math.sin(time * 3.2);
        const tinyBounce = Math.sin(time * 6.4) * 0.006;
        target.bob = breath * 0.042 + tinyBounce;
        target.width += breath * 0.015;
        target.height -= breath * 0.017;
        target.tilt = Math.sin(time * 1.55) * 0.014;
    } else if (state === 'walk' || state === 'tiptoe') {
        const multiplier = state === 'tiptoe' ? 0.86 : 1;
        const cycle = localTime * 11.4 * multiplier;
        const step = Math.sin(cycle);
        const doubleStep = Math.cos(cycle * 2);
        target.bob = Math.abs(step) * 0.105 * multiplier;
        target.width += doubleStep * 0.022;
        target.height -= doubleStep * 0.027;
        target.tilt = step * 0.04 * facing - depth * 0.018;
        target.x = horizontal * step * 0.026;
        if (state === 'tiptoe') {
            target.y += 0.025;
            target.width -= 0.018;
            target.height += 0.025;
        }
    } else if (state === 'run' || state === 'sprint') {
        const multiplier = state === 'sprint' ? 1.19 : 1;
        const cycle = localTime * 15.5 * multiplier;
        const stride = Math.sin(cycle);
        const compression = Math.cos(cycle * 2);
        target.bob = Math.abs(stride) * 0.155 * multiplier;
        target.width += compression * 0.038;
        target.height -= compression * 0.046;
        target.tilt = -0.058 * facing + stride * 0.03 - depth * 0.028;
        target.x = horizontal * (0.03 + stride * 0.018);
    } else if (['takeoff', 'jump', 'hop', 'hover', 'fall'].includes(state)) {
        const verticalRatio = clamp(jumpVelocity / Math.max(Number(jumpForce) || 1, 0.001), -1, 1);
        const airPulse = Math.sin(localTime * 5.6);
        target.width += verticalRatio > 0 ? -0.06 : 0.07;
        target.height += verticalRatio > 0 ? 0.085 : -0.055;
        target.tilt = -Number(velocityX || 0) * 0.009 - depth * 0.022;
        target.bob += airPulse * 0.018;
        if (state === 'hop') {
            target.width += 0.045;
            target.height -= 0.035;
            target.tilt += Math.sin(localTime * 7) * 0.04 * facing;
        }
        if (state === 'hover') {
            target.bob += Math.sin(localTime * 8) * 0.06;
        }
    } else if (state === 'land') {
        const impact = Math.sin(phase * Math.PI);
        target.width += impact * 0.19;
        target.height -= impact * 0.21;
        target.y = -impact * 0.09;
        target.tilt = Math.sin(phase * Math.PI * 2) * 0.025 * facing;
    } else if (state === 'skid' || state === 'slide') {
        const burst = Math.sin(phase * Math.PI);
        target.width += burst * 0.17;
        target.height -= burst * 0.12;
        target.tilt = -0.15 * facing - depth * 0.052;
        target.x = -facing * burst * 0.085;
    } else if (state === 'dash') {
        const burst = Math.sin(phase * Math.PI);
        target.width += burst * 0.18;
        target.height -= burst * 0.11;
        target.tilt = -0.14 * facing - depth * 0.06;
        target.x = -facing * 0.075;
    } else if (state === 'dodge') {
        const arc = Math.sin(phase * Math.PI);
        target.width += arc * 0.15;
        target.height -= arc * 0.18;
        target.bob = arc * 0.18;
        target.tilt = Math.sin(phase * Math.PI * 2) * 0.24 * facing;
    } else if (state === 'turn') {
        const swivel = Math.sin(phase * Math.PI);
        target.width -= swivel * 0.12;
        target.bob = swivel * 0.055;
        target.tilt = swivel * 0.07 * facing;
    } else if (state === 'win' || state === 'celebrate') {
        const cycle = localTime * 9.2;
        target.bob = Math.abs(Math.sin(cycle)) * 0.16;
        target.tilt = Math.sin(cycle * 0.5) * 0.05;
        target.width += Math.cos(cycle) * 0.032;
        target.height -= Math.cos(cycle) * 0.032;
    } else if (state === 'dance') {
        const cycle = localTime * 9.8;
        target.bob = Math.abs(Math.sin(cycle)) * 0.185;
        target.x = Math.sin(cycle * 0.5) * 0.19;
        target.tilt = Math.sin(cycle * 0.5) * 0.11;
        target.width += Math.cos(cycle) * 0.048;
        target.height -= Math.cos(cycle) * 0.048;
    } else if (state === 'guitar') {
        const riff = Math.sin(phase * Math.PI);
        const pulse = Math.sin(localTime * 14.5);
        target.bob = Math.abs(pulse) * 0.12 + riff * 0.05;
        target.x = Math.sin(localTime * 7.5) * 0.05 * facing;
        target.tilt = (-0.08 * facing) + Math.sin(localTime * 5.5) * 0.05;
        target.width += riff * 0.08;
        target.height -= riff * 0.03;
    } else if (state === 'wave' || state === 'salute') {
        const cycle = localTime * 8;
        target.bob = Math.abs(Math.sin(cycle * 0.5)) * 0.06;
        target.tilt = Math.sin(cycle) * 0.052 * facing;
        target.x = Math.sin(cycle * 0.5) * 0.04 * facing;
    } else if (state === 'spin') {
        const spin = phase * Math.PI * 4;
        target.width = Math.max(0.08, Math.abs(Math.cos(spin)));
        target.height += Math.sin(spin * 0.5) * 0.045;
        target.bob = Math.abs(Math.sin(spin * 0.5)) * 0.1;
        target.tilt = Math.sin(spin) * 0.06;
    } else if (state === 'crouch') {
        const settle = 1 - Math.exp(-localTime * 10);
        target.width += 0.11 * settle;
        target.height -= 0.18 * settle;
        target.y = -0.09 * settle;
        target.tilt = -0.025 * facing;
    } else if (state === 'laugh') {
        const cycle = localTime * 11.8;
        target.bob = Math.abs(Math.sin(cycle)) * 0.11;
        target.tilt = Math.sin(cycle * 0.5) * 0.045;
        target.width += Math.cos(cycle) * 0.043;
        target.height -= Math.cos(cycle) * 0.043;
    } else if (state === 'pose') {
        target.bob = Math.sin(localTime * 3.1) * 0.03;
        target.width += 0.032;
        target.height += 0.038;
        target.tilt = -0.038 * facing;
    } else if (state === 'sleep') {
        const sway = Math.sin(localTime * 2.05);
        target.bob = sway * 0.02;
        target.tilt = (0.09 + sway * 0.025) * facing;
        target.width += sway * 0.013;
        target.height -= sway * 0.013;
        target.y = -0.038;
    } else if (state === 'taunt') {
        const cycle = localTime * 9.6;
        target.x = Math.sin(cycle) * 0.07 * facing;
        target.tilt = -Math.sin(cycle) * 0.055 * facing;
        target.bob = Math.abs(Math.sin(cycle * 0.5)) * 0.07;
        target.width += Math.cos(cycle) * 0.032;
    }

    return target;
}
