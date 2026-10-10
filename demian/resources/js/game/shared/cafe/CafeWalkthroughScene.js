/**
 * Canonical, renderer-neutral survey of the three supplied 2026-10-09 videos.
 * Units are gameplay units, NOT surveyed metres. Visible features and their
 * sequence are observed; dimensions and unseen footprint boundaries are inferred.
 * Front glazing is south (+z); the washroom is north (-z).
 */
export function freezeCafe(value) {
    if (Array.isArray(value)) return Object.freeze(value.map(freezeCafe));
    if (value && typeof value === 'object') return Object.freeze(Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, freezeCafe(item)]),
    ));
    return value;
}

const item = (id, kind, x, z, halfX, halfZ, options = {}) => ({
    id, kind, position: { x, z }, halfExtents: { x: halfX, z: halfZ }, ...options,
});
const wall = (id, x, z, halfX, halfZ, options = {}) => item(id, 'wall', x, z, halfX, halfZ, { height: 3.8, ...options });
const chair = (id, x, z, facing = 'north', style = 'dining') => item(id, 'chair', x, z, .68, .7, { facing, style, height: .9 });
const plant = (id, x, z, style = 'leaf', size = .55) => item(id, 'plant', x, z, size, size, { style, height: 1.7 });

export const CAFE_LAYOUT_VERSION = 3;
export const CAFE_BOUNDS = freezeCafe({ minX: -12, maxX: 12, minZ: -66, maxZ: 18 });
export const CAFE_RENDER_BOUNDS = freezeCafe({ minX: -13, maxX: 13, minZ: -71, maxZ: 24 });
export const CAFE_FLOOR = freezeCafe({ width: 24, depth: 84, color: 0xc7c7c1 });

export const CAFE_ROOMS = freezeCafe([
    { id: 'main-hall', label: 'سالن اصلی', bounds: { minX: -12, maxX: 12, minZ: -8, maxZ: 18 }, floor: 'stone', source: 'video-1' },
    { id: 'rear-hall', label: 'سالن پشتی', bounds: { minX: -12, maxX: 12, minZ: -44, maxZ: -8 }, floor: 'stone', source: 'video-2' },
    { id: 'washroom', label: 'روشویی', bounds: { minX: -1, maxX: 6, minZ: -66, maxZ: -44 }, floor: 'charcoal-stone', source: 'video-3' },
    { id: 'wc-cubicle', label: 'WC', bounds: { minX: 6, maxX: 12, minZ: -66, maxZ: -56 }, floor: 'light-stone', source: 'video-3' },
]);

export const CAFE_WALLS = freezeCafe([
    wall('wall-main-west', -11.8, -13, .2, 30.8),
    wall('wall-main-east', 11.8, -13, .2, 30.8),
    wall('wall-south-left', -6.9, 17.8, 4.9, .2, { material: 'glass' }),
    wall('wall-south-right', 6.9, 17.8, 4.9, .2, { material: 'glass' }),
    // Keep door apertures clear in BOTH painting and collision geometry.
    wall('wall-rear-left', -5.9, -44, 5.9, .22),
    wall('wall-rear-right', 9.5, -44, 2.3, .22),
    wall('wall-washroom-entry-left', .65, -44, .65, .22),
    wall('wall-washroom-entry-right', 5.6, -44, .4, .22),
    wall('wall-washroom-west', -.8, -55, .2, 11),
    wall('wall-washroom-north', 2.6, -65.8, 3.6, .2),
    wall('wall-green-east-front', 6, -51.3, .18, 7.3, { material: 'green-tile' }),
    wall('wall-green-east-back', 6, -64.6, .18, 1.2, { material: 'green-tile' }),
    wall('wall-cubicle-north', 9, -65.8, 3, .2, { material: 'light-stone' }),
    wall('wall-cubicle-east', 11.8, -61, .2, 5, { material: 'light-stone' }),
    wall('wall-cubicle-south', 9, -56, 3, .2, { material: 'light-stone' }),
    // The videos do not survey adjacent rooms. These are sealed, unpainted
    // voids, not invented staff rooms, kitchens, seating or a second toilet.
    item('unobserved-west-footprint', 'void', -6.5, -55, 5.5, 11, { height: 4 }),
    item('unobserved-east-footprint', 'void', 9, -50, 3, 6, { height: 4 }),
]);

const fixtures = [
    item('column-front-west', 'column', -3.9, -6.8, .58, .62, { height: 3.8 }),
    item('column-front-east', 'column', 3.9, -6.8, .58, .62, { height: 3.8 }),
    item('column-middle', 'column', -.8, -22, .58, .65, { height: 3.1 }),
    item('column-rear', 'column', -.8, -36, .58, .65, { height: 3.1 }),

    item('counter-front', 'counter', 8.35, 11.3, 3.0, 1.0, { height: 1.15, style: 'concrete', source: 'video-1@24' }),
    item('counter-side', 'counter', 5.7, 3.2, .7, 7.2, { height: 1.15, style: 'concrete' }),
    item('counter-backline', 'counter', 10.9, 3.3, .65, 7.9, { height: 1.05, style: 'green-tile' }),
    item('bar-return', 'counter', 10.1, -4.55, 1.1, .65, { height: 1.05, style: 'dark-wood' }),
    item('merch-shelf', 'shelf', 10.65, 14.5, .78, 1.3, { height: 2.1, style: 'mint', source: 'video-1@18' }),
    item('air-conditioner-front', 'air-conditioner', 9.2, 16.5, .6, .5, { height: 2.2 }),
    item('bookcase-front', 'shelf', -10.9, 9.2, .52, 4.9, { height: 2.3, style: 'floating-books', shelves: 4 }),
    item('communal-table', 'table', -6.95, 9.7, 2.0, 3.5, { height: .8, style: 'honey-wood', set: 'flowers' }),
    chair('communal-chair-west-1', -9.9, 8.1, 'east'), chair('communal-chair-west-2', -9.9, 11.3, 'east'),
    chair('communal-chair-east-1', -3.95, 8.1, 'west'), chair('communal-chair-east-2', -3.95, 11.3, 'west'),
    chair('communal-chair-north', -6.95, 5.25, 'south'), chair('communal-chair-south', -6.95, 14.15),
    item('rug-table', 'table', -7.0, -1.8, 2.1, 1.5, { height: .8, set: 'cups' }),
    chair('rug-chair-west', -10.0, -1.8, 'east'), chair('rug-chair-east', -3.9, -1.8, 'west'),
    chair('rug-chair-north-1', -8.1, -4.2, 'south'), chair('rug-chair-north-2', -5.7, -4.2, 'south'),
    chair('rug-chair-south-1', -8.1, .65), chair('rug-chair-south-2', -5.7, .65),
    item('mirror-stand', 'mirror', -10.85, 2.1, .4, .65, { height: 2.1, style: 'black', roosters: true }),
    item('branch-vase', 'vase', -10.0, 2.9, .26, .28, { height: 1.6, style: 'branches' }),
    item('radio-sideboard', 'sideboard', 9.2, -7.2, 1.8, .48, { height: 1.0, style: 'black-cane', set: 'radio' }),
    item('bar-stool', 'stool', 11.0, -6.7, .45, .45, { height: .95 }),

    item('rear-table-1', 'table', -6.7, -15.0, 2.15, 1.65, { height: .8, set: 'number' }),
    item('rear-table-2', 'table', -6.7, -28.5, 2.15, 1.65, { height: .8, set: 'number' }),
    item('lounge-table-1', 'table', 6.7, -17.2, 1.85, 2.4, { height: .5, style: 'coffee-table', set: 'number' }),
    item('lounge-table-2', 'table', 6.7, -32.0, 1.85, 2.4, { height: .5, style: 'coffee-table', set: 'number' }),
    item('sofa-1', 'sofa', 10.05, -17.2, 1.05, 2.4, { height: .9, facing: 'west', style: 'charcoal' }),
    item('sofa-2', 'sofa', 10.05, -32.0, 1.05, 2.4, { height: .9, facing: 'west', style: 'charcoal' }),
    item('armchair-1-west', 'sofa', 6.7, -12.85, 1.15, .85, { height: .9, facing: 'north', style: 'armchair' }),
    item('armchair-1-east', 'sofa', 6.7, -21.55, 1.15, .85, { height: .9, facing: 'south', style: 'armchair' }),
    item('armchair-2-west', 'sofa', 6.7, -27.65, 1.15, .85, { height: .9, facing: 'north', style: 'armchair' }),
    item('armchair-2-east', 'sofa', 6.7, -36.35, 1.15, .85, { height: .9, facing: 'south', style: 'armchair' }),
    item('record-sideboard', 'sideboard', 6.8, -40.8, 2.35, .55, { height: 1.0, style: 'cream-cane', set: 'turntable' }),
    item('speaker-front', 'speaker', 2.75, -8.8, .4, .4, { height: 1.15 }),
    item('air-conditioner-rear', 'air-conditioner', -9.6, -42.0, .65, .5, { height: 2.2 }),

    plant('plant-entrance-ficus', 7.8, 14.7), plant('plant-entrance-cactus', 7.0, 16.25, 'cactus', .4),
    plant('plant-entrance-palm', -10.0, 15.8, 'palm', .6), plant('plant-bookcase', -10.0, 4.2, 'yucca', .5),
    plant('plant-merch', 9.45, 12.9, 'monstera', .5), plant('plant-mirror', -10.55, .9),
    plant('plant-lounge-1', 10.7, -23.65), plant('plant-lounge-2', 10.7, -38.5),
    plant('plant-back', -7.8, -42.0, 'yucca', .45),

    item('vanity', 'vanity', .25, -53.3, .95, 4.3, { height: .86, style: 'green-tile' }),
    item('red-mirror', 'mirror', 2.85, -64.9, .65, .24, { height: 2.15, style: 'coral' }),
    item('toilet', 'toilet', 9.6, -63.3, .8, 1.15, { height: .9 }),
    item('toilet-bin', 'bin', 10.7, -59.3, .28, .3, { height: .45, style: 'steel' }),
    item('red-bin', 'bin', 5.2, -64.9, .35, .35, { height: .6, style: 'coral' }),
];
for (const [index, z] of [-15, -28.5].entries()) {
    fixtures.push(
        chair(`rear-chair-${index}-west`, -9.95, z, 'east', 'cane'),
        chair(`rear-chair-${index}-east`, -3.45, z, 'west', 'cane'),
        chair(`rear-chair-${index}-north-1`, -7.8, z - 2.65, 'south', 'cane'),
        chair(`rear-chair-${index}-north-2`, -5.55, z - 2.65, 'south', 'cane'),
        chair(`rear-chair-${index}-south-1`, -7.8, z + 2.65, 'north', 'cane'),
        chair(`rear-chair-${index}-south-2`, -5.55, z + 2.65, 'north', 'cane'),
    );
}
export const CAFE_FIXTURES = freezeCafe(fixtures);

export const CAFE_RUGS = freezeCafe([
    item('entry-mat', 'rug', 0, 16.0, 1.4, .75, { style: 'burgundy', pattern: 'persian' }),
    item('main-rug', 'rug', -7, -1.8, 4.3, 3.9, { style: 'burgundy', pattern: 'persian' }),
    item('lounge-rug-1', 'rug', 6.7, -17.2, 4.4, 5.3, { style: 'burgundy', pattern: 'persian' }),
    item('lounge-rug-2', 'rug', 6.7, -32.0, 4.4, 5.3, { style: 'burgundy', pattern: 'persian' }),
    item('wc-door-mat', 'rug', 3.3, -42.8, 1.5, .8, { style: 'burgundy', pattern: 'plain' }),
]);

export const CAFE_DOORS = freezeCafe([
    item('front-glass', 'glass-door', 0, 17.8, 2, .12, { label: 'ورودی', style: 'black-glass', state: 'open' }),
    item('washroom-door', 'panel-door', 3.3, -44, 2, .12, { label: 'WC', style: 'white-panel', state: 'open' }),
    item('cubicle-door', 'panel-door', 6, -61, .12, 2.4, { style: 'charcoal', state: 'open', axis: 'z' }),
]);

export const CAFE_DECOR = freezeCafe([
    item('green-bar-backsplash', 'tile-panel', 11.3, 3.6, .3, 7.5, { material: 'green-tile' }),
    item('bar-bottle-shelf', 'bottle-shelf', 10.7, 3.6, .35, 7.5),
    item('espresso-machine', 'espresso', 10.35, .3, .55, 1.15),
    item('coffee-grinders', 'grinders', 10.4, 3.0, .45, .65),
    item('cups-and-juicer', 'bar-tools', 10.35, 6.3, .52, 1.0),
    item('pos-terminal', 'pos', 7.8, 11.3, .75, .5),
    item('pastry-dome', 'pastry', 10.2, 11.1, .55, .5),
    item('bar-logo', 'logo', 11.25, 8.0, .35, 1.1),
    item('bar-quote', 'quote', 10.75, -6.5, .3, 1.0, {
        lines: ['از نظر من زندگی بشر راهی برای به خود رسیدن', 'کوششی در طول یک گذرگاه', 'و اشاره‌ای در مقابل یک جاده است', 'دمیان / هرمان هسه'],
    }),
    item('portraits-main', 'portraits', -11.25, -1.8, .35, 3.1, { count: 3, style: 'black-white', images: ['portrait-1.jpg', 'portrait-2.jpg', 'portrait-3.jpg'] }),
    item('portrait-corridor', 'portraits', -2.0, -40.9, .35, 1.0, { count: 1, style: 'black-white', images: ['corridor-portrait.jpg'] }),
    item('record-wall-photos', 'landscape-photos', 6.8, -43.55, 1.8, .3, { count: 2 }),
    item('neon-hello', 'neon', 2.85, -65.65, 1.75, .18, { text: 'Hello gorgeous', color: '#ff5b46' }),
    item('sink-front', 'basin', .4, -50.8, .67, .67, { color: '#dc683e' }),
    item('sink-back', 'basin', .4, -55.5, .67, .67, { color: '#dc683e' }),
    item('basin-mirror-front', 'arched-mirror', -.45, -50.8, .15, 1.25, { backlit: true }),
    item('basin-mirror-back', 'arched-mirror', -.45, -55.5, .15, 1.25, { backlit: true }),
    item('vanity-soap-towels', 'soap-towels', .4, -53.2, .55, .45),
    item('wc-spray', 'spray', 10.9, -64.45, .25, .45),
    item('toilet-paper', 'toilet-paper', 10.9, -61.8, .25, .3),
    item('wc-sign', 'wc-sign', 5.8, -43.3, .5, .15),
]);

export const CAFE_LIGHTS = freezeCafe([
    item('main-track-light', 'linear-light', 1.2, 5.3, .07, 10.0, { ceiling: 'acoustic-grid' }),
    item('bar-track-light', 'track-light', 8.8, 4.0, .06, 7.5, { ceiling: 'acoustic-grid' }),
    ...[-14.5, -29.0, -38.2].flatMap((z, i) => [
        item(`sconce-west-${i}`, 'sconce', -11.15, z, .28, .5),
        item(`sconce-east-${i}`, 'sconce', 11.15, z, .28, .5),
    ]),
    ...[[-10.7, -6.2], [2.5, -22.7], [-10.7, -21.2], [2.4, -37.5], [9.0, -40.4]].map(([x, z], i) =>
        item(`floor-lamp-${i}`, 'floor-lamp', x, z, .3, .3)),
    ...[-48.5, -54.7, -60.9].map((z, i) => item(`washroom-spot-${i}`, 'downlight', 3.2, z, .2, .2)),
]);

export const CAFE_CEILING = freezeCafe([
    { id: 'main-ceiling', bounds: CAFE_ROOMS[0].bounds, material: 'white-acoustic-grid', tileSize: 1.4, tracks: ['main-track-light', 'bar-track-light'] },
    { id: 'rear-ceiling', bounds: CAFE_ROOMS[1].bounds, material: 'white-plaster', fixtures: 'warm-wall-sconces', flag: { x: 1.2, z: -9.5, colors: ['#292725', '#e9c754', '#bd4235'] } },
    { id: 'washroom-ceiling', bounds: CAFE_ROOMS[2].bounds, material: 'charcoal', fixtures: 'downlights' },
]);

export const CAFE_CHARACTER_SPAWNS = freezeCafe([
    { x: 0, z: 14.2 }, { x: -.2, z: 5 }, { x: 2, z: -11 }, { x: -.2, z: -26 }, { x: 2, z: -40 },
]);
export const CAFE_WALKTHROUGH_ROUTE = freezeCafe([
    { id: 'entrance', x: 0, z: 14.2 },
    { id: 'front-aisle', x: 0, z: 5.5 },
    { id: 'main-hall', x: 0, z: -2 },
    { id: 'rear-transition', x: .8, z: -10.5 },
    { id: 'rear-dining', x: 0.8, z: -19 },
    { id: 'rear-lounge', x: 0.8, z: -29 },
    { id: 'wc-approach', x: 2, z: -40 },
    { id: 'wc-door', x: 3.3, z: -45.5 },
    { id: 'washroom', x: 3.3, z: -53 },
    { id: 'red-mirror', x: 3.3, z: -62 },
    { id: 'cubicle', x: 8.1, z: -60.9 },
]);

export function cafeRoomAt(position, margin = 0) {
    return CAFE_ROOMS.find(({ bounds: b }) => position.x >= b.minX + margin && position.x <= b.maxX - margin
        && position.z >= b.minZ + margin && position.z <= b.maxZ - margin) ?? null;
}

export const CAFE_SURVEY = freezeCafe({
    date: '2026-10-09', layoutVersion: CAFE_LAYOUT_VERSION, units: 'gameplay-units', measured: false,
    videos: [
        { id: 'video-1', file: '20261009_112412_1.mp4', duration: 50.028889, areas: ['glazing', 'books', 'merch', 'counter', 'main-hall'] },
        { id: 'video-2', file: '20261009_112412_2.mp4', duration: 50.539022, areas: ['radio', 'rear-dining', 'lounge', 'record-sideboard', 'wc-entry'] },
        { id: 'video-3', file: '20261009_112412_3.mp4', duration: 40.724688, areas: ['vanity', 'mirrors', 'green-tile', 'neon', 'wc-cubicle'] },
    ],
    inferred: ['dimensions', 'room footprint', 'exact inter-object spacing', 'hidden boundary positions'],
    excluded: ['unseen adjoining rooms', 'people in the videos', 'invented arcade cabinets', 'unobserved second cubicle'],
});
