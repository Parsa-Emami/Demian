import * as THREE from 'three';
import {
    CAFE_ENVIRONMENT_ID,
    CAFE_REFERENCE_ASSET_ROOT,
    CAFE_SCENE_STYLE,
} from './CafeEnvironmentContract.js';

/**
 * Applies the single approved visual environment to a gameplay scene.
 * Keeping this policy in one place prevents an individual game from silently
 * falling back to the previous neon/city scene.
 */
export function configureCafeScene(scene, { fogDensity = CAFE_SCENE_STYLE.defaultFogDensity } = {}) {
    if (!scene) throw new TypeError('A THREE.Scene is required for the café environment.');

    scene.background = new THREE.Color(CAFE_SCENE_STYLE.background);
    scene.fog = Number(fogDensity) > 0
        ? new THREE.FogExp2(CAFE_SCENE_STYLE.fog, Number(fogDensity))
        : null;
    scene.userData.environmentId = CAFE_ENVIRONMENT_ID;
    scene.userData.environmentLocked = true;
    scene.userData.referenceAssetRoot = CAFE_REFERENCE_ASSET_ROOT;
    return scene;
}
