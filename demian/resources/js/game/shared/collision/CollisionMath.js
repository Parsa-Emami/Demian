const EPSILON = 1e-8;

export function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

export function point2(value = {}) {
    return { x: finiteNumber(value.x), z: finiteNumber(value.z) };
}

export function aabbFromCenter(center, halfExtents) {
    const point = point2(center);
    const halfX = Math.max(EPSILON, finiteNumber(halfExtents?.x, 0.5));
    const halfZ = Math.max(EPSILON, finiteNumber(halfExtents?.z, 0.5));
    return {
        minX: point.x - halfX,
        maxX: point.x + halfX,
        minZ: point.z - halfZ,
        maxZ: point.z + halfZ,
    };
}

export function circleAabb(center, radius) {
    const point = point2(center);
    const resolvedRadius = Math.max(EPSILON, finiteNumber(radius, 0.5));
    return {
        minX: point.x - resolvedRadius,
        maxX: point.x + resolvedRadius,
        minZ: point.z - resolvedRadius,
        maxZ: point.z + resolvedRadius,
    };
}

export function mergeAabbs(a, b) {
    return {
        minX: Math.min(a.minX, b.minX),
        maxX: Math.max(a.maxX, b.maxX),
        minZ: Math.min(a.minZ, b.minZ),
        maxZ: Math.max(a.maxZ, b.maxZ),
    };
}

export function aabbsOverlap(a, b) {
    return !(
        a.maxX < b.minX ||
        a.minX > b.maxX ||
        a.maxZ < b.minZ ||
        a.minZ > b.maxZ
    );
}

export function circlesOverlap(aCenter, aRadius, bCenter, bRadius) {
    const dx = finiteNumber(aCenter.x) - finiteNumber(bCenter.x);
    const dz = finiteNumber(aCenter.z) - finiteNumber(bCenter.z);
    const combined = Math.max(0, finiteNumber(aRadius)) + Math.max(0, finiteNumber(bRadius));
    return dx * dx + dz * dz <= combined * combined;
}

export function circleIntersectsAabb(center, radius, aabb) {
    const x = Math.max(aabb.minX, Math.min(center.x, aabb.maxX));
    const z = Math.max(aabb.minZ, Math.min(center.z, aabb.maxZ));
    const dx = center.x - x;
    const dz = center.z - z;
    return dx * dx + dz * dz <= radius * radius;
}

export function circleVsAabbPenetration(center, radius, aabb) {
    const nearestX = Math.max(aabb.minX, Math.min(center.x, aabb.maxX));
    const nearestZ = Math.max(aabb.minZ, Math.min(center.z, aabb.maxZ));
    let dx = center.x - nearestX;
    let dz = center.z - nearestZ;
    const distanceSquared = dx * dx + dz * dz;

    if (distanceSquared > radius * radius) {
        return null;
    }

    if (distanceSquared > EPSILON) {
        const distance = Math.sqrt(distanceSquared);
        const depth = radius - distance;
        return {
            x: (dx / distance) * depth,
            z: (dz / distance) * depth,
            normal: { x: dx / distance, z: dz / distance },
            depth,
        };
    }

    const left = Math.abs(center.x - aabb.minX);
    const right = Math.abs(aabb.maxX - center.x);
    const top = Math.abs(center.z - aabb.minZ);
    const bottom = Math.abs(aabb.maxZ - center.z);
    const minimum = Math.min(left, right, top, bottom);

    if (minimum === left) {
        dx = -(radius + left);
        dz = 0;
    } else if (minimum === right) {
        dx = radius + right;
        dz = 0;
    } else if (minimum === top) {
        dx = 0;
        dz = -(radius + top);
    } else {
        dx = 0;
        dz = radius + bottom;
    }

    const depth = Math.hypot(dx, dz);
    return {
        x: dx,
        z: dz,
        normal: depth > EPSILON ? { x: dx / depth, z: dz / depth } : { x: 0, z: 0 },
        depth,
    };
}

export function circleVsCirclePenetration(aCenter, aRadius, bCenter, bRadius) {
    let dx = aCenter.x - bCenter.x;
    let dz = aCenter.z - bCenter.z;
    const combined = aRadius + bRadius;
    const distanceSquared = dx * dx + dz * dz;

    if (distanceSquared > combined * combined) {
        return null;
    }

    if (distanceSquared <= EPSILON) {
        dx = combined;
        dz = 0;
    }

    const distance = Math.max(Math.sqrt(dx * dx + dz * dz), EPSILON);
    const depth = combined - distance;
    return {
        x: (dx / distance) * depth,
        z: (dz / distance) * depth,
        normal: { x: dx / distance, z: dz / distance },
        depth,
    };
}

export function segmentAabbIntersection(from, to, aabb) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    let near = 0;
    let far = 1;
    let normal = { x: 0, z: 0 };

    for (const axis of ['x', 'z']) {
        const delta = axis === 'x' ? dx : dz;
        const origin = from[axis];
        const minimum = axis === 'x' ? aabb.minX : aabb.minZ;
        const maximum = axis === 'x' ? aabb.maxX : aabb.maxZ;

        if (Math.abs(delta) < EPSILON) {
            if (origin < minimum || origin > maximum) return null;
            continue;
        }

        let t1 = (minimum - origin) / delta;
        let t2 = (maximum - origin) / delta;
        let nearNormal = axis === 'x'
            ? { x: delta > 0 ? -1 : 1, z: 0 }
            : { x: 0, z: delta > 0 ? -1 : 1 };

        if (t1 > t2) {
            [t1, t2] = [t2, t1];
        }

        if (t1 > near) {
            near = t1;
            normal = nearNormal;
        }
        far = Math.min(far, t2);
        if (near > far) return null;
    }

    if (near < 0 || near > 1) return null;
    return {
        fraction: near,
        point: { x: from.x + dx * near, z: from.z + dz * near },
        normal,
    };
}

export function segmentCircleIntersection(from, to, center, radius) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const fx = from.x - center.x;
    const fz = from.z - center.z;
    const a = dx * dx + dz * dz;

    if (a <= EPSILON) return null;

    const b = 2 * (fx * dx + fz * dz);
    const c = fx * fx + fz * fz - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;

    const root = Math.sqrt(discriminant);
    const candidates = [(-b - root) / (2 * a), (-b + root) / (2 * a)]
        .filter((value) => value >= 0 && value <= 1)
        .sort((left, right) => left - right);
    if (candidates.length === 0) return null;

    const fraction = candidates[0];
    const point = { x: from.x + dx * fraction, z: from.z + dz * fraction };
    const nx = point.x - center.x;
    const nz = point.z - center.z;
    const length = Math.max(Math.hypot(nx, nz), EPSILON);
    return {
        fraction,
        point,
        normal: { x: nx / length, z: nz / length },
    };
}
