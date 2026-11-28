import * as THREE from 'three';

const DIRECTIONS = Object.freeze(['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']);
export const DIRECTION_VECTORS = Object.freeze(Object.fromEntries(DIRECTIONS.map((direction, index) => [
    direction, Object.freeze({ x: Math.cos(index * Math.PI / 4), z: Math.sin(index * Math.PI / 4) }),
])));

export function directionFromHeading(x, z, fallback = 'e') {
    if (x * x + z * z < 0.0004) return fallback;
    const sector = Math.round(Math.atan2(z, x) / (Math.PI / 4));
    return DIRECTIONS[(sector + 8) % 8];
}

export class DirectionTransition {
    constructor(seconds) {
        this.seconds = seconds;
        this.elapsed = 0;
        this.turn = 1;
    }

    toward(current, target, elapsed) {
        if (!(this.seconds > 0) || current === target) {
            this.elapsed = 0;
            return target;
        }
        const from = DIRECTIONS.indexOf(current);
        const to = DIRECTIONS.indexOf(target);
        if (from < 0 || to < 0) return target;
        const clockwise = (to - from + 8) % 8;
        const distance = Math.min(clockwise, 8 - clockwise);
        if (clockwise !== 4) this.turn = clockwise < 4 ? 1 : -1;
        this.elapsed += elapsed;
        const steps = Math.min(distance, Math.floor(this.elapsed / this.seconds));
        this.elapsed = steps === distance ? 0 : this.elapsed - steps * this.seconds;
        return DIRECTIONS[(from + 8 + this.turn * steps) % 8];
    }
}

export function directionFromVector(vector, fallback = 'e') {
    return vector ? directionFromHeading(vector.x, vector.z, fallback) : fallback;
}

export function directionProfile(direction) {
    const isVertical = direction === 'n' || direction === 's';
    const isDiagonal = ['ne', 'se', 'sw', 'nw'].includes(direction);
    const depthSign = direction.includes('n') ? -1 : direction.includes('s') ? 1 : 0;

    return {
        isVertical,
        isDiagonal,
        depthSign,
        horizontalSign: direction.includes('w') ? -1 : direction.includes('e') ? 1 : 0,
    };
}
 
export function cameraRelativeDirection(inputX, inputZ, basis) {
    const right = basis?.right?.clone?.() ?? new THREE.Vector3(1, 0, 0);
    const forward = basis?.forward?.clone?.() ?? new THREE.Vector3(0, 0, -1);

    right.y = 0;
    forward.y = 0;
    right.normalize();
    forward.normalize();

    return right.multiplyScalar(inputX).add(forward.multiplyScalar(-inputZ));
}
