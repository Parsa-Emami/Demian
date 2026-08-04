export const CAFE_ENVIRONMENT_ID = 'demian-reference-cafe@2';
export const CAFE_WORLD_ID = 'demian-reference-cafe';
export const CAFE_REFERENCE_ASSET_ROOT = '/assets/reference/cafe';

export const CAFE_SCENE_STYLE = Object.freeze({
    background: 0xdad5cc,
    fog: 0xdad5cc,
    defaultFogDensity: 0.014,
});

export function markCafeEnvironment(environment) {
    if (!environment) throw new TypeError('The café environment group was not created.');
    environment.userData.environmentId = CAFE_ENVIRONMENT_ID;
    environment.userData.environmentLocked = true;
    environment.userData.referenceAssetRoot = CAFE_REFERENCE_ASSET_ROOT;
    environment.userData.referenceCafe = true;
    return environment;
}

export function assertCafeGameDefinition(gameId, definition) {
    const environmentId = definition?.metadata?.environment;
    if (environmentId !== CAFE_ENVIRONMENT_ID || definition?.metadata?.environmentLocked !== true) {
        throw new Error(`Game "${gameId}" is not locked to ${CAFE_ENVIRONMENT_ID}.`);
    }
    return true;
}

export function assertCafeWorldManifest(manifest) {
    if (manifest?.id !== CAFE_WORLD_ID) {
        throw new Error(`Open World must use "${CAFE_WORLD_ID}" instead of "${manifest?.id ?? 'unknown'}".`);
    }
    return true;
}
