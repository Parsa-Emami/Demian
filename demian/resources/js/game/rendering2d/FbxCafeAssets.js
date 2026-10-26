import { CAFE_FBX } from '../shared/cafe/CafeWalkthroughScene.js';
const ROOT = 'assets/environments/demian-fbx/';
let floorplan = null, pending = null, detailFloorplan = null, detailPending = null, revision = 0;
export function fbxCafeAssetUrl(filename, base = globalThis.document?.baseURI) {
    const version = filename === 'floorplan-detail.webp' ? 'quality-v15-20261026' : CAFE_FBX.assetVersion;
    const path = `${ROOT}${filename}?v=${version}`;
    return base ? new URL(path, base).href : `/${path}`;
}
export const fbxFloorplanImage = (detail = false) => detail && detailFloorplan ? detailFloorplan : floorplan;
export const fbxCafeArtRevision = () => revision;
export function preloadFbxCafeArt({ detail = false } = {}) {
    const base = preloadBaseArt();
    if (!detail) return base;
    if (detailFloorplan) return Promise.resolve(detailFloorplan);
    detailPending ??= loadFloorplan('floorplan-detail.webp').then(image => {
        if (image) { detailFloorplan = image; revision += 1; }
        detailPending = null;
        return image;
    });
    return Promise.all([base, detailPending]).then(([baseImage, detailImage]) => detailImage ?? baseImage);
}

function preloadBaseArt() {
    if (floorplan) return Promise.resolve(floorplan);
    if (pending) return pending;
    if (typeof globalThis.Image !== 'function') return Promise.resolve(null);
    pending = loadFloorplan('floorplan.webp').then(image => {
        if (image) { floorplan = image; revision += 1; }
        pending = null;
        return image;
    });
    return pending;
}

function loadFloorplan(filename) {
    if (typeof globalThis.Image !== 'function') return Promise.resolve(null);
    return new Promise((resolve) => {
        const image = new Image();
        const timer = setTimeout(() => finish(null), 12000);
        const finish = (value) => {
            clearTimeout(timer); image.onload = image.onerror = null;
            resolve(value);
        };
        image.onload = () => {
            if (typeof image.decode !== 'function') { finish(image); return; }
            image.decode().then(() => finish(image), () => finish(null));
        };
        image.onerror = () => finish(null);
        image.src = fbxCafeAssetUrl(filename);
    });
}
