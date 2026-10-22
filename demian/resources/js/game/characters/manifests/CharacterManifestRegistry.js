/**
 * Character Core V4 — manifest-driven roster registry.
 *
 * This module is the runtime counterpart of
 * `public/assets/characters/character-manifest-v4.json`. Per the Demian
 * Full Game Rebuild Master Pack's non-negotiable directive:
 *
 *   - Every character has a `production_status` of either
 *     `gold_standard_production` for the shipped V14 characters.
 *   - The active/default character resolution, roster ordering, and any
 *     "new character onboarding" flow should read from this registry
 *     rather than from ad hoc hardcoded arrays.
 *
 * The active roster includes Darya, Setayesh, Uzudi, Negar, Tiam, AmirReza, Hanna and Ainaz, rebuilt from references.
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
        Object.freeze({ slug: 'darya', displayName: 'DARYA / دریا', productionStatus: 'gold_standard_production', isDefaultActive: true, packVersion: 14 }),
        Object.freeze({ slug: 'setayesh', displayName: 'SETAYESH / ستایش', productionStatus: 'gold_standard_production', isDefaultActive: false, packVersion: 14 }),
        Object.freeze({ slug: 'uzudi', displayName: 'UZUDI / اوزودی', productionStatus: 'gold_standard_production', isDefaultActive: false, packVersion: 14, locomotionStyle: 'wing-assisted' }),
        Object.freeze({ slug: 'negar', displayName: 'NEGAR / نگار', productionStatus: 'gold_standard_production', isDefaultActive: false, packVersion: 14 }),
        Object.freeze({ slug: 'tiam', displayName: 'TIAM / تیام', productionStatus: 'gold_standard_production', isDefaultActive: false, packVersion: 14 }),
        Object.freeze({ slug: 'amirreza', displayName: 'AMIRREZA / امیررضا', productionStatus: 'gold_standard_production', isDefaultActive: false, packVersion: 14, locomotionStyle: 'wing-assisted' }),
        Object.freeze({ slug: 'hanna', displayName: 'HANNA / حنا', productionStatus: 'gold_standard_production', isDefaultActive: false, packVersion: 14 }),
        Object.freeze({ slug: 'ainaz', displayName: 'AINAZ / آیناز', productionStatus: 'gold_standard_production', isDefaultActive: false, packVersion: 14 }),
        Object.freeze({ slug: 'arsal', displayName: 'ARSAL / ارسل', productionStatus: 'gold_standard_production', isDefaultActive: false, packVersion: 14 }),
        Object.freeze({ slug: 'iman', displayName: 'IMAN / ایمان', productionStatus: 'gold_standard_production', isDefaultActive: false, packVersion: 14 }),
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

/** Reference-driven characters with installed production assets. */
export const PRODUCTION_CHARACTER_SLUGS = slugsWithStatus(PRODUCTION_STATUS.GOLD_STANDARD);

/** Reserved for future manifests; no legacy characters are playable in V14. */
export const LEGACY_CHARACTER_SLUGS = slugsWithStatus(PRODUCTION_STATUS.LEGACY_PENDING);

/** All builtin character slugs known to the manifest, production first. */
export const ALL_MANIFEST_SLUGS = Object.freeze([
    ...PRODUCTION_CHARACTER_SLUGS,
    ...LEGACY_CHARACTER_SLUGS,
]);

export const BUILTIN_CHARACTER_LABELS = Object.freeze(Object.fromEntries(
    EMBEDDED_ROSTER_SNAPSHOT.characters.map((entry) => [entry.slug, entry.displayName])
));

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
