/**
 * Backward-compatible import path.
 *
 * Older builds imported DemianCityManifest directly and could therefore load
 * the retired neon city. The legacy path now resolves to the same reference
 * café manifest used by the current Open World game.
 */
export {
    DEMIAN_REFERENCE_CAFE_DEFINITION as DEMIAN_CITY_MANIFEST_DEFINITION,
    DEMIAN_REFERENCE_CAFE_MANIFEST as DEMIAN_CITY_MANIFEST,
    DEMIAN_REFERENCE_CAFE_MANIFEST as default,
} from './DemianReferenceCafeManifest.js';
