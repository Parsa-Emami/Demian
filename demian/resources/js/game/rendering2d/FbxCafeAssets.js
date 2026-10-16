import { CAFE_FBX } from '../shared/cafe/CafeWalkthroughScene.js';
const ROOT = 'assets/environments/demian-fbx/';
let floorplan = null, pending = null, revision = 0;
export function fbxCafeAssetUrl(filename, base = globalThis.document?.baseURI) {
    const path = `${ROOT}${filename}?v=${CAFE_FBX.assetVersion}`;
    return base ? new URL(path, base).href : `/${path}`;
}
export const fbxFloorplanImage = () => floorplan;
export const fbxCafeArtRevision = () => revision;
/** Small source-model bake is all the game downloads. The 3D model is on demand. */
export function preloadFbxCafeArt() {
    if (floorplan) return Promise.resolve(floorplan);
    if (pending) return pending;
    if (typeof globalThis.Image !== 'function') return Promise.resolve(null);
    pending = new Promise((resolve) => {
        const image = new Image();
        const timer = setTimeout(() => finish(null), 12000);
        const finish = (value) => {
            clearTimeout(timer); image.onload = image.onerror = null;
            if (value) { floorplan = value; revision += 1; }
            pending = null; resolve(value);
        };
        image.onload = () => finish(image);
        image.onerror = () => finish(null);
        image.src = fbxCafeAssetUrl('floorplan.webp');
    });
    return pending;
}
