import { CAFE_BOUNDS, CAFE_STATIC_COLLIDERS } from '../shared/cafe/CafeReferenceLayout.js';
import { CAFE_ROOMS } from '../shared/cafe/CafeWalkthroughScene.js';
import { fbxFloorplanImage, fbxCafeArtRevision, preloadFbxCafeArt } from './FbxCafeAssets.js';

/** Orthographic bake of the complete FBX, shared by gameplay and both maps.
 * Canvas keeps the existing character controls and sprites deterministic and fast.
 */
export default class CafePixelRenderer {
    constructor({ bounds = CAFE_BOUNDS, colliders = CAFE_STATIC_COLLIDERS, detail = false } = {}) {
        this.bounds = bounds; this.colliders = colliders;
        this.detail = detail;
        void preloadFbxCafeArt({ detail });
    }
    get revision() { return fbxCafeArtRevision(); }
    draw(ctx, camera, { atmosphere = 'day' } = {}) {
        ctx.save();
        const image = fbxFloorplanImage(this.detail);
        if (image) {
            const b = CAFE_BOUNDS;
            const rect = camera.worldRect({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 },
                { x: (b.maxX - b.minX) / 2, z: (b.maxZ - b.minZ) / 2 });
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
        } else {
            // Network failure still shows the actual FBX collision footprint.
            for (const room of CAFE_ROOMS) {
                const b = room.bounds, r = camera.worldRect({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 },
                    { x: (b.maxX - b.minX) / 2, z: (b.maxZ - b.minZ) / 2 });
                ctx.fillStyle = '#d6cfc0'; ctx.fillRect(r.x,r.y,r.width,r.height);
            }
            for (const collider of this.colliders) {
                const r = camera.worldRect(collider.position,collider.halfExtents);
                ctx.fillStyle = '#565e55'; ctx.fillRect(r.x,r.y,r.width,r.height);
            }
        }
        if (atmosphere === 'night') {
            ctx.fillStyle = 'rgba(17,24,31,.24)'; ctx.fillRect(0,0,camera.viewportWidth,camera.viewportHeight);
        }
        ctx.restore();
    }
}
