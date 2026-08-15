/**
 * Demian V10 high-contrast 8-bit palette.
 *
 * The palette deliberately uses a compact set of related tones so the world,
 * characters and HUD read as one authored pixel-art game instead of a mix of
 * unrelated UI gradients. Keep additions semantic; renderers should consume
 * these tokens rather than inventing one-off colours.
 */
export const PIXEL_PALETTE = Object.freeze({
    void: '#070a12',
    voidBlue: '#0b1020',
    ink: '#111827',
    inkSoft: '#1f2937',

    floorA: '#d6cfbd',
    floorB: '#c6bba6',
    floorLight: '#eee5d1',
    grout: '#9f927c',

    wall: '#49372f',
    wallTop: '#755847',
    wallLight: '#a77a58',
    wallTrim: '#c49167',
    wallEdge: '#2c211e',
    shadow: '#241a1c',
    shadowBlue: '#172033',

    wood: '#805033',
    woodDark: '#4b2d24',
    woodLight: '#b8794c',
    woodGlow: '#d69a61',
    metal: '#626a73',
    metalDark: '#343b46',
    metalLight: '#a8b0b8',

    counter: '#6b3f2a',
    counterTop: '#d09a63',
    counterEdge: '#3c241e',

    rug: '#294f61',
    rugDark: '#173847',
    rugDetail: '#e4be62',

    sofa: '#6f8073',
    sofaDark: '#465247',
    sofaLight: '#9cab91',

    plant: '#4f824d',
    plantDark: '#2a4f32',
    plantLight: '#83ad5d',

    glass: '#78c6cf',
    glassDark: '#397985',
    glassLight: '#d2fbf7',

    cream: '#f0dfbf',
    white: '#fff4d6',
    muted: '#aeb8c7',

    accent: '#ffb454',
    cyan: '#43e6e9',
    cyanDark: '#117e91',
    pink: '#ff6fb5',
    pinkDark: '#9c376b',
    purple: '#a986ff',
    purpleDark: '#5a3da6',
    red: '#f05252',
    green: '#52d273',
    gold: '#ffd166',
    amber: '#f59e0b',
});

export function cssColor(value, fallback = '#94a3b8') {
    if (typeof value === 'string') return value;
    const numeric = Number(value);
    return Number.isFinite(numeric)
        ? `#${Math.max(0, numeric).toString(16).padStart(6, '0').slice(-6)}`
        : fallback;
}
