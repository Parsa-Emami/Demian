import { CAFE_BOUNDS, CAFE_STATIC_COLLIDERS } from '../shared/cafe/CafeReferenceLayout.js';

/**
 * Data-only façade for the canonical café world.
 * Visible rendering is owned by the Canvas2D pipeline; this class preserves
 * the existing Open World interaction contract without allocating 3D meshes.
 */
export default class ArcadeWorld {
    constructor(scene, { streamingMode = false } = {}) {
        this.scene = scene;
        this.streamingMode = streamingMode;
        this.root = { name: 'DemianReferenceCafeDataRoot', parent: scene, visible: true };
        this.bounds = CAFE_BOUNDS;
        this.colliders = CAFE_STATIC_COLLIDERS;
        this.cabinets = [
            { id: 'arcade-cabinet', gameId: 'tetris', position: { x: 17.8, y: 0, z: -9.4 }, interaction: { x: 16.2, z: -9.4, radius: 2.4 }, userData: { gameId: 'tetris' } },
        ];
        this.elapsed = 0;
    }

    ensureAttached() { this.root.parent = this.scene; return true; }
    update(deltaTime = 0) { this.elapsed += Math.max(0, Number(deltaTime) || 0); }
    updateCameraVisibility() { return true; }
    renderStats() { return { backend: 'canvas2d-pixel', colliders: this.colliders.length, cabinets: this.cabinets.length, streamingMode: this.streamingMode }; }
    dispose() { this.root.parent = null; this.scene = null; }
}
