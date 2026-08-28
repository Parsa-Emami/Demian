export const CHARACTER_PACK_VERSION = 6;

// Per-character pack version overrides. This lets a single character move to
// a newer/higher-fidelity asset pack (e.g. an HD re-sample built by
// tools/build_hd_character_pack.py) independently, without bumping every
// other built-in character to a version whose files don't exist yet.
// Add a slug here once its vN pack has been generated and validated
// (npm run validate:character-art / audit_character_sprite_packs.py); until
// then every character keeps resolving to CHARACTER_PACK_VERSION as before.
export const CHARACTER_PACK_VERSION_OVERRIDES = Object.freeze({
    // Only characters that actually ship a v7 pack are promoted. Characters
    // without a supplied reference remain on the existing v6 art untouched.
    darya: 7,
    mojtaba: 7,
    hossein: 7,
    arsal: 7,
    sorkhi: 7,
    'taher-db': 7,
});

export function characterPackVersion(slug) {
    const normalizedSlug = String(slug ?? '').trim().toLowerCase();
    return CHARACTER_PACK_VERSION_OVERRIDES[normalizedSlug] ?? CHARACTER_PACK_VERSION;
}

export const BUILTIN_CHARACTER_SLUGS = Object.freeze([
    'tiam',
    'ronak',
    'amirreza',
    'parsa',
    'darya',
    'iman',
    'uzudi',
    'setayesh',
    'mojtaba',
    'hossein',
    'arsal',
    'sorkhi',
    'taher-db',
]);

export const CHARACTER_SPRITE_VARIANTS = Object.freeze([
    'desktop',
    'mobile',
    'compact',
]);

export const CHARACTER_CANONICAL_BODY = Object.freeze({
    worldWidth: 3.75,
    worldHeight: 3.75,
    minReferenceWidthRatio: 0.42,
    maxReferenceWidthRatio: 0.98,
    minReferenceHeightRatio: 0.62,
    maxReferenceHeightRatio: 0.98,
});

export const REMOVED_COMBAT_ANIMATIONS = Object.freeze([
    'attack',
    'combo',
    'uppercut',
    'cast',
    'charge',
    'hurt',
    'punch',
    'kick',
    'hit',
]);

const REMOVED_COMBAT_SET = new Set(REMOVED_COMBAT_ANIMATIONS);

export function isRemovedCombatAnimation(name) {
    return REMOVED_COMBAT_SET.has(String(name ?? '').toLowerCase());
}

export function sanitizeCharacterAnimation(name, fallback = 'idle') {
    const normalized = String(name ?? '').trim();
    return !normalized || isRemovedCombatAnimation(normalized) ? fallback : normalized;
}

export function normalizeSpriteVariant(variant = 'mobile') {
    return CHARACTER_SPRITE_VARIANTS.includes(variant) ? variant : 'mobile';
}

export function characterAssetRelativePath(slug, variant = 'mobile', type = 'sprite') {
    const normalizedSlug = String(slug ?? '').trim().toLowerCase();
    const normalizedVariant = normalizeSpriteVariant(variant);
    const packVersion = characterPackVersion(normalizedSlug);
    const filename = type === 'atlas'
        ? `${normalizedSlug}-atlas-v${packVersion}-${normalizedVariant}.json`
        : `${normalizedSlug}-spritesheet-v${packVersion}-${normalizedVariant}.png`;

    return `assets/characters/${normalizedSlug}/${filename}`;
}

export function resolveCharacterAssetUrl(relativePath, baseUrl = globalThis.document?.baseURI) {
    if (!baseUrl) {
        return `/${String(relativePath).replace(/^\/+/, '')}`;
    }

    return new URL(String(relativePath).replace(/^\/+/, ''), baseUrl).toString();
}

export function builtinCharacterAssetPair(slug, variant = 'mobile', baseUrl = globalThis.document?.baseURI) {
    const normalizedVariant = normalizeSpriteVariant(variant);

    return Object.freeze({
        spriteUrl: resolveCharacterAssetUrl(
            characterAssetRelativePath(slug, normalizedVariant, 'sprite'),
            baseUrl
        ),
        atlasUrl: resolveCharacterAssetUrl(
            characterAssetRelativePath(slug, normalizedVariant, 'atlas'),
            baseUrl
        ),
        variant: normalizedVariant,
    });
}

function clamp(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
}

export function characterFrameWorldSize(atlas, display = CHARACTER_CANONICAL_BODY) {
    const canonicalBodyWidth = Math.max(0.1, Number(display?.worldWidth) || CHARACTER_CANONICAL_BODY.worldWidth);
    const canonicalBodyHeight = Math.max(0.1, Number(display?.worldHeight) || CHARACTER_CANONICAL_BODY.worldHeight);

    const render = atlas?.render ?? {};
    const referenceWidthRatio = clamp(
        render.referenceBodyWidthRatio,
        CHARACTER_CANONICAL_BODY.minReferenceWidthRatio,
        CHARACTER_CANONICAL_BODY.maxReferenceWidthRatio,
        0.72
    );
    const referenceHeightRatio = clamp(
        render.referenceBodyHeightRatio ?? render.normalizedBodyHeightRatio,
        CHARACTER_CANONICAL_BODY.minReferenceHeightRatio,
        CHARACTER_CANONICAL_BODY.maxReferenceHeightRatio,
        0.86
    );

    // Sprite cells are square. Use one uniform world scale for X/Y so body and
    // facial proportions never get stretched merely to equalize character size.
    // V6 source art is pre-normalized and each atlas stores the measured visible
    // body-height ratio. Applying that ratio gives every character the exact same
    // perceived height while natural body width and facial proportions stay intact.
    const frameSize = canonicalBodyHeight / referenceHeightRatio;
    const bodyWidth = frameSize * referenceWidthRatio;

    return Object.freeze({
        bodyWidth,
        bodyHeight: canonicalBodyHeight,
        canonicalBodyWidth,
        referenceWidthRatio,
        referenceHeightRatio,
        frameWidth: frameSize,
        frameHeight: frameSize,
    });
}
