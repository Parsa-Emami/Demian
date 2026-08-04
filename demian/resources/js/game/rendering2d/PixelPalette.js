export const PIXEL_PALETTE = Object.freeze({
    void: '#17130f', floorA: '#d8d0c0', floorB: '#cec4b2', grout: '#b9ad99',
    wall: '#493b31', wallTop: '#6c5747', wallTrim: '#9b7a5e', shadow: '#211b18',
    wood: '#744a2d', woodDark: '#4a2e20', woodLight: '#a66e43', metal: '#706e69',
    counter: '#6b4027', counterTop: '#c19462', rug: '#35586a', rugDetail: '#d6b56d',
    sofa: '#6f7e75', sofaDark: '#47534d', plant: '#4f7a4e', plantDark: '#2f5132',
    glass: '#9ed4d4', cream: '#efe3cf', accent: '#efb15d', cyan: '#66d9e8',
    pink: '#ef7da9', purple: '#a58be8', red: '#e56767', gold: '#e1b75b', white: '#fff7e8',
});

export function cssColor(value, fallback = '#94a3b8') {
    if (typeof value === 'string') return value;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `#${Math.max(0, numeric).toString(16).padStart(6, '0').slice(-6)}` : fallback;
}
