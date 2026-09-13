import { BUILTIN_CHARACTER_SLUGS } from '../../characters/CharacterVisualContract.js';

export const ARCADE_CHARACTER_LABELS = Object.freeze({
    tiam: 'TIAM / تیام',
    ronak: 'RONAK / روناک',
    amirreza: 'AMIRREZA / امیررضا',
    parsa: 'PARSA / پارسا',
    darya: 'DARYA / دریا',
    iman: 'IMAN / ایمان',
    uzudi: 'UZUDI / اوزودی',
    setayesh: 'SETAYESH / ستایش',
    mojtaba: 'MOJTABA / مجتبی',
    hossein: 'HOSSEIN / حسین',
    arsal: 'ARSAL / ارسل',
    sorkhi: 'SORKHI / سرخی',
    'taher-db': 'TAHER DB / طاهر DB',
});

const REFERENCE_CARD_SLUGS = new Set([
    'amirreza', 'arsal', 'darya', 'hossein', 'iman', 'mojtaba',
    'parsa', 'setayesh', 'sorkhi', 'taher-db', 'uzudi',
]);

export const ARCADE_CHARACTER_ROSTER = Object.freeze(
    BUILTIN_CHARACTER_SLUGS.map((slug) => Object.freeze({
        slug,
        label: ARCADE_CHARACTER_LABELS[slug] ?? slug.toUpperCase(),
        referenceCard: REFERENCE_CARD_SLUGS.has(slug)
            ? `/assets/characters/${slug}/${slug}-character-sheet-reference-v9.jpg`
            : null,
    }))
);

export function arcadeCharacterLabel(slug) {
    return ARCADE_CHARACTER_LABELS[slug] ?? String(slug ?? '').toUpperCase();
}
