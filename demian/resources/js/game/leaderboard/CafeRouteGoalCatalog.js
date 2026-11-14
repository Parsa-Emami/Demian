export const CAFE_ROUTE_VERSIONS = Object.freeze({
    'after-hours': 'after-hours-route-v1',
    'cafe-rush': 'cafe-rush-route-v1',
    'open-world': 'open-world-route-v1',
});

const TITLES = Object.freeze({
    'card-1': 'کارت شیفت اول',
    'card-2': 'کارت شیفت دوم',
    exit: 'خروج از کافه',
    'save-counter': 'پیشخوان',
    'save-lounge': 'لانژ',
    'save-arcade': 'سالن بازی',
});
const RUSH_SPOTS = Object.freeze({
    tickets: [-0.1, -26.35], bar: [2.95, -31.15],
    pastry: [2.6, -22.25], 'table-1': [-2.35, -16.9],
    'table-2': [-2.9, -43.4],
});
const AFTER_LAYOUTS = Object.freeze([
    [[1.1, -24.8], [3.7, -68.5]],
    [[-10.9, -34.6], [-11.8, -65.5]],
    [[7.0, -48.8], [-6.4, -72.7]],
]);
const MENUS = ['tea', 'cake', 'espresso', 'tea', 'espresso', 'cake'];
const TABLES = [1, 2, 1, 2, 1, 2, 2, 1];

export function cafeRouteGoals(gameId, seed) {
    if (!Object.hasOwn(CAFE_ROUTE_VERSIONS, gameId)
        || !Number.isSafeInteger(seed) || seed < 0) {
        throw new TypeError('Unknown route challenge rules or invalid seed.');
    }
    if (gameId === 'open-world') return [
        { id: 'save-counter', x: 3.24, z: -30.6, title: TITLES['save-counter'] },
        { id: 'save-lounge', x: .36, z: -68.76, title: TITLES['save-lounge'] },
        { id: 'save-arcade', x: 3.96, z: -88.92, title: TITLES['save-arcade'] },
    ];
    if (gameId === 'after-hours') {
        const [a, b] = AFTER_LAYOUTS[seed % 3];
        return [
            { id: 'card-1', x: a[0], z: a[1], title: TITLES['card-1'] },
            { id: 'card-2', x: b[0], z: b[1], title: TITLES['card-2'] },
            { id: 'exit', x: .4, z: -3.9, title: TITLES.exit },
        ];
    }
    const goals = [];
    for (let index = 0; index < 2; index++) {
        const recipe = MENUS[(index + seed % 3) % MENUS.length];
        const station = recipe === 'cake' ? 'pastry' : 'bar';
        const table = 'table-' + TABLES[(index + seed % 3) % TABLES.length];
        for (const [i, target] of ['tickets', station, table].entries()) {
            const [x, z] = RUSH_SPOTS[target];
            goals.push({
                id: 'order' + (index+1) + '-' + i + '-' + target,
                x, z,
                title: ['برگه سفارش', 'آماده‌سازی', 'تحویل در میز'][i]
                    + ' · ' + (index+1),
            });
        }
    }
    return goals;
}

export const CAFE_ROUTE_LIMITS = Object.freeze({
    'after-hours': 300*60,
    'cafe-rush': 120*60,
    'open-world': 240*60,
});
