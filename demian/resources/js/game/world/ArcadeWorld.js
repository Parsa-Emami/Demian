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
            { id: 'merch-shelf', gameId: 'dino-run', position: { x: 10.65, y: 0, z: 14.5 }, interaction: { x: 7.0, z: 13.4, radius: 2.4 }, userData: { gameId: 'dino-run' } },
            { id: 'after-hours-panel', gameId: 'after-hours', position: { x: -6.6, z: -4.8 },
                interaction: { x: -5.4, z: -4.8, radius: 2.35 }, minimumFacing: -1,
                userData: { gameId: 'after-hours' } },
            { id: 'cafe-rush-counter', gameId: 'cafe-rush', position: { x: -0.1, z: -26.35 },
                interaction: { x: -0.1, z: -26.35, radius: 2.15 }, minimumFacing: -1,
                userData: { gameId: 'cafe-rush' } },
            { id: 'critters-window-table', gameId: 'cafe-critters', position: { x: .36, z: -17.3 },
                interaction: { x: .36, z: -17.3, radius: 2.15 }, minimumFacing: -1,
                userData: { gameId: 'cafe-critters' } },
        ];
        this.elapsed = 0;
    }

    ensureAttached() { this.root.parent = this.scene; return true; }
    update(deltaTime = 0) { this.elapsed += Math.max(0, Number(deltaTime) || 0); }
    updateCameraVisibility() { return true; }
    renderStats() { return { backend: 'canvas2d-pixel', colliders: this.colliders.length, cabinets: this.cabinets.length, streamingMode: this.streamingMode }; }
    dispose() { this.root.parent = null; this.scene = null; }
}
