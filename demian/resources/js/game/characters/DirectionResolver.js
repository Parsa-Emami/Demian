import * as THREE from 'three';

const DIRECTIONS = Object.freeze(['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']);

export function directionFromVector(vector, fallback = 'e') {
    if (!vector || vector.lengthSq() < 0.0004) {
        return fallback;
    }

    const angle = Math.atan2(vector.z, vector.x);
    const sector = Math.round(angle / (Math.PI / 4));
    const normalized = ((sector % 8) + 8) % 8;
    return DIRECTIONS[normalized];
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
