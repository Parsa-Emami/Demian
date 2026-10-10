/** Aspect-preserving floorplan projection, aligned with the game camera (+z down). */
export function cafeMapCamera(bounds, width, height, padding = 12) {
    const scale = Math.max(.01, Math.min(
        (width - padding * 2) / (bounds.maxX - bounds.minX),
        (height - padding * 2) / (bounds.maxZ - bounds.minZ),
    ));
    const center = { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 };
    const worldToScreen = (p) => ({ x: width / 2 + (p.x - center.x) * scale, y: height / 2 + (p.z - center.z) * scale });
    return {
        pixelsPerUnit: scale, viewportWidth: width, viewportHeight: height,
        worldToScreen,
        screenToWorld: (p) => ({ x: center.x + (p.x - width / 2) / scale, z: center.z + (p.y - height / 2) / scale }),
        worldRect: (p, h) => {
            const a = worldToScreen({ x: p.x - h.x, z: p.z - h.z });
            return { x: a.x, y: a.y, width: h.x * scale * 2, height: h.z * scale * 2 };
        },
    };
}
