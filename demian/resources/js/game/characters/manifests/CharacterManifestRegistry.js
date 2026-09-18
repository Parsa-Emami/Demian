/**
 * Character Core V4 — manifest-driven roster registry.
 *
 * This module is the runtime counterpart of
 * `public/assets/characters/character-manifest-v4.json`. Per the Demian
 * Full Game Rebuild Master Pack's non-negotiable directive:
 *
 *   - Every character has a `production_status` of either
 *     `gold_standard_production` (only `darya`, for now) or
 *     `legacy_pending_reference_rebuild` (everyone else).
 *   - The active/default character resolution, roster ordering, and any
 *     "new character onboarding" flow should read from this registry
 *     rather than from ad hoc hardcoded arrays.
 *
 * `CharacterVisualContract.js` keeps `BUILTIN_CHARACTER_SLUGS` as-is for
 * full backward compatibility with its existing consumers (SpriteCharacter,
 * FrameAnimator, ArcadeCharacterRoster, CharacterManager, PixelActorRenderer,
 * CharacterVisualService — see grep results in
 * docs/character-standards/CHARACTER_CORE_V4_IMPLEMENTATION.md), and layers
 * the production/legacy distinction on top via this registry instead of
 * removing anything those files depend on.
 */

const MANIFEST_URL_PATH = 'assets/characters/character-manifest-v4.json';
const FETCH_TIMEOUT_MS = 5000;

/**
 * Embedded snapshot of character-manifest-v4.json, kept in sync manually.
 * This exists so every synchronous call site in the current codebase
 * (built before this registry existed) keeps working without needing an
 * async refactor. Call `loadRosterManifest()` when you want the live,
 * server-fetched copy instead (e.g. in an admin/studio tool).
 */
const EMBEDDED_ROSTER_SNAPSHOT = Object.freeze({
    manifestVersion: 'v4',
    productionCharacter: 'darya',
    characters: Object.freeze([
        Object.freeze({ slug: 'darya', productionStatus: 'gold_standard_production', isDefaultActive: true, packVersion: 12 }),
        Object.freeze({ slug: 'tiam', productionStatus: 'legacy_pending_reference_rebuild', isDefaultActive: false, packVersion: 6 }),
        Object.freeze({ slug: 'ronak', productionStatus: 'legacy_pending_reference_rebuild', isDefaultActive: false, packVersion: 6 }),
        Object.freeze({ slug: 'amirreza', productionStatus: 'legacy_pending_reference_rebuild', isDefaultActive: false, packVersion: 9 }),
        Object.freeze({ slug: 'parsa', productionStatus: 'legacy_pending_reference_rebuild', isDefaultActive: false, packVersion: 9 }),
        Object.freeze({ slug: 'iman', productionStatus: 'legacy_pending_reference_rebuild', isDefaultActive: false, packVersion: 9 }),
        Object.freeze({ slug: 'uzudi', productionStatus: 'legacy_pending_reference_rebuild', isDefaultActive: false, packVersion: 9 }),
        Object.freeze({ slug: 'setayesh', productionStatus: 'legacy_pending_reference_rebuild', isDefaultActive: false, packVersion: 9 }),
        Object.freeze({ slug: 'mojtaba', productionStatus: 'legacy_pending_reference_rebuild', isDefaultActive: false, packVersion: 9 }),
        Object.freeze({ slug: 'hossein', productionStatus: 'legacy_pending_reference_rebuild', isDefaultActive: false, packVersion: 9 }),
        Object.freeze({ slug: 'arsal', productionStatus: 'legacy_pending_reference_rebuild', isDefaultActive: false, packVersion: 9 }),
        Object.freeze({ slug: 'sorkhi', productionStatus: 'legacy_pending_reference_rebuild', isDefaultActive: false, packVersion: 9 }),
        Object.freeze({ slug: 'taher-db', productionStatus: 'legacy_pending_reference_rebuild', isDefaultActive: false, packVersion: 9 }),
    ]),
});

export const PRODUCTION_STATUS = Object.freeze({
    GOLD_STANDARD: 'gold_standard_production',
    LEGACY_PENDING: 'legacy_pending_reference_rebuild',
});

function slugsWithStatus(status) {
    return Object.freeze(
        EMBEDDED_ROSTER_SNAPSHOT.characters
            .filter((entry) => entry.productionStatus === status)
            .map((entry) => entry.slug)
    );
}

/** Characters that are fully reference-driven, gold-standard production characters. Currently just Darya. */
export const PRODUCTION_CHARACTER_SLUGS = slugsWithStatus(PRODUCTION_STATUS.GOLD_STANDARD);

/** Every other builtin character: kept installed/playable, but excluded from default selection. */
export const LEGACY_CHARACTER_SLUGS = slugsWithStatus(PRODUCTION_STATUS.LEGACY_PENDING);

/** All builtin character slugs known to the manifest, production first. */
export const ALL_MANIFEST_SLUGS = Object.freeze([
    ...PRODUCTION_CHARACTER_SLUGS,
    ...LEGACY_CHARACTER_SLUGS,
]);

/** The slug that should be treated as the default/active character absent any other signal. */
export const DEFAULT_ACTIVE_SLUG = EMBEDDED_ROSTER_SNAPSHOT.characters.find((c) => c.isDefaultActive)?.slug
    ?? PRODUCTION_CHARACTER_SLUGS[0]
    ?? 'darya';

export function characterManifestEntry(slug) {
    const normalized = String(slug ?? '').trim().toLowerCase();
    return EMBEDDED_ROSTER_SNAPSHOT.characters.find((entry) => entry.slug === normalized) ?? null;
}

export function characterProductionStatus(slug) {
    return characterManifestEntry(slug)?.productionStatus ?? PRODUCTION_STATUS.LEGACY_PENDING;
}

export function isProductionReady(slug) {
    return characterProductionStatus(slug) === PRODUCTION_STATUS.GOLD_STANDARD;
}

/**
 * Fetches the live `character-manifest-v4.json` from the server. Falls back
 * to the embedded snapshot (normalized into the same shape) on any error or
 * timeout, so callers never have to special-case failure.
 */
export async function loadRosterManifest(baseUrl = globalThis.document?.baseURI) {
    const url = baseUrl
        ? new URL(MANIFEST_URL_PATH, baseUrl).toString()
        : `/${MANIFEST_URL_PATH}`;

    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Character manifest request failed (${response.status}).`);
        const json = await response.json();
        if (!Array.isArray(json?.characters)) throw new Error('Character manifest is missing "characters".');
        return json;
    } catch {
        return EMBEDDED_ROSTER_SNAPSHOT;
    } finally {
        globalThis.clearTimeout(timeout);
    }
}
