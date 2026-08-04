function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function point(value = {}) { return { x: Number(value.x) || 0, z: Number(value.z) || 0 }; }

/** World-space camera for deterministic top-down pixel rendering. */
export default class PixelCamera2D {
    constructor({ bounds, viewportWidth = 480, viewportHeight = 270, pixelsPerUnit = 10, smoothing = 9 } = {}) {
        this.bounds = bounds ?? { minX: -24, maxX: 24, minZ: -18, maxZ: 18 };
        this.viewportWidth = viewportWidth;
        this.viewportHeight = viewportHeight;
        this.pixelsPerUnit = pixelsPerUnit;
        this.targetPixelsPerUnit = pixelsPerUnit;
        this.smoothing = smoothing;
        this.position = { x: 0, z: 0 };
        this.target = { x: 0, z: 0 };
    }

    resize(width, height) {
        this.viewportWidth = Math.max(1, Number(width) || 1);
        this.viewportHeight = Math.max(1, Number(height) || 1);
        this.clampTarget();
        return this;
    }

    setZoom(pixelsPerUnit, { immediate = false } = {}) {
        this.targetPixelsPerUnit = clamp(Number(pixelsPerUnit) || 10, 4, 32);
        if (immediate) this.pixelsPerUnit = this.targetPixelsPerUnit;
        this.clampTarget();
        return this;
    }

    fitBounds(bounds = this.bounds, padding = 12) {
        const worldWidth = Math.max(1, bounds.maxX - bounds.minX);
        const worldHeight = Math.max(1, bounds.maxZ - bounds.minZ);
        const scaleX = (this.viewportWidth - padding * 2) / worldWidth;
        const scaleY = (this.viewportHeight - padding * 2) / worldHeight;
        this.setZoom(Math.max(4, Math.min(scaleX, scaleY)), { immediate: true });
        this.jumpTo({ x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 });
        return this;
    }

    follow(target, { immediate = false } = {}) {
        this.target = point(target);
        this.clampTarget();
        if (immediate) this.position = { ...this.target };
        return this;
    }

    jumpTo(target) { return this.follow(target, { immediate: true }); }

    update(deltaTime = 1 / 60) {
        const alpha = 1 - Math.exp(-this.smoothing * Math.max(0, deltaTime));
        this.position.x += (this.target.x - this.position.x) * alpha;
        this.position.z += (this.target.z - this.position.z) * alpha;
        this.pixelsPerUnit += (this.targetPixelsPerUnit - this.pixelsPerUnit) * alpha;
        return this;
    }

    clampTarget() {
        const halfWidth = this.viewportWidth / (2 * this.targetPixelsPerUnit);
        const halfHeight = this.viewportHeight / (2 * this.targetPixelsPerUnit);
        const minX = this.bounds.minX + halfWidth;
        const maxX = this.bounds.maxX - halfWidth;
        const minZ = this.bounds.minZ + halfHeight;
        const maxZ = this.bounds.maxZ - halfHeight;
        this.target.x = minX > maxX ? (this.bounds.minX + this.bounds.maxX) / 2 : clamp(this.target.x, minX, maxX);
        this.target.z = minZ > maxZ ? (this.bounds.minZ + this.bounds.maxZ) / 2 : clamp(this.target.z, minZ, maxZ);
    }

    worldToScreen(world) {
        return {
            x: Math.round(this.viewportWidth / 2 + ((Number(world?.x) || 0) - this.position.x) * this.pixelsPerUnit),
            y: Math.round(this.viewportHeight / 2 + ((Number(world?.z) || 0) - this.position.z) * this.pixelsPerUnit),
        };
    }

    screenToWorld(screen) {
        return {
            x: this.position.x + ((Number(screen?.x) || 0) - this.viewportWidth / 2) / this.pixelsPerUnit,
            z: this.position.z + ((Number(screen?.y) || 0) - this.viewportHeight / 2) / this.pixelsPerUnit,
        };
    }

    worldRect(position, halfExtents) {
        const topLeft = this.worldToScreen({ x: position.x - halfExtents.x, z: position.z - halfExtents.z });
        const bottomRight = this.worldToScreen({ x: position.x + halfExtents.x, z: position.z + halfExtents.z });
        return {
            x: topLeft.x,
            y: topLeft.y,
            width: Math.max(1, bottomRight.x - topLeft.x),
            height: Math.max(1, bottomRight.y - topLeft.y),
        };
    }
}
