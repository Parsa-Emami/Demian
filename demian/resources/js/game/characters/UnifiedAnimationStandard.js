import standard from '../../../game/sprite-animation-standard-v2.json' with { type: 'json' };

export const UNIFIED_ANIMATION_VERSION = standard.version;

export function unifiedAnimationAlias(atlas, state) {
    if (atlas?.meta?.version !== standard.packVersion || atlas?.motion?.timingVersion !== 'natural-locomotion-v2') return null;
    if (!Object.hasOwn(standard.aliases, state)) return null;
    const alias = standard.aliases[state];
    return atlas.animations?.[alias]?.frames?.length ? alias : null;
}

export function isUnifiedAtlas(atlas) {
    return atlas?.meta?.version === standard.packVersion && atlas?.motion?.timingVersion === 'natural-locomotion-v2';
}
