import raw from '../../../game/character-animation-standard-v2.json' with { type: 'json' };
import visual from '../../../game/character-visual-standard-v2.json' with { type: 'json' };

export const ANIMATION_STANDARD_V2 = Object.freeze(raw);

export function shippedMotionSlug(atlas) {
    if (atlas?.meta?.version !== raw.packVersion || atlas?.meta?.generatedFrameCount !== raw.logicalFrames) return null;
    const slug = String(atlas.meta.slug ?? atlas.meta.name?.split('/')[0] ?? '').trim().toLowerCase().replace(/\s+/g, '-');
    return Object.hasOwn(visual.characters, slug) ? slug : null;
}

export function sharedVisualAlias(atlas, requested) {
    if (!shippedMotionSlug(atlas) || !Object.hasOwn(raw.aliases, requested)) return null;
    const alias = raw.aliases[requested].source;
    return atlas.animations?.[alias]?.frames?.length ? alias : null;
}
