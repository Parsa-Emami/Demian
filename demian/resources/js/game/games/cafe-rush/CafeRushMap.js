import { createCafeGround } from '../../shared/cafe/CafeGround.js';
import { freezeCafe } from '../../shared/cafe/CafeWalkthroughScene.js';

export const RUSH_DURATION = 120;
export const VIP_AT = 90;
export const RUSH_BOUNDS = Object.freeze({ minX: -14.7, maxX: 14.7, minZ: -49.5, maxZ: -8.5 });
export const RUSH_START = Object.freeze({ x: -0.35, z: -25.3 });

export const RUSH_RULES = freezeCafe({
    easy: { label: 'آسان', level: 3, quota: 4, capacity: 1, patience: 33, cadence: 12.0 },
    standard: { label: 'استاندارد', level: 5, quota: 6, capacity: 2, patience: 31, cadence: 8.2 },
    hard: { label: 'سخت', level: 8, quota: 8, capacity: 3, patience: 29, cadence: 6.6 },
});

export const RUSH_SPOTS = freezeCafe([
    { id: 'tickets', kind: 'tickets', label: 'برگهٔ سفارش', sign: '▤', x: -0.1, z: -26.35 },
    { id: 'bar', kind: 'station', label: 'بار نوشیدنی', sign: '◒', x: 2.95, z: -31.15 },
    { id: 'pastry', kind: 'station', label: 'میز شیرینی', sign: '◇', x: 2.6, z: -22.25 },
    { id: 'table-1', kind: 'table', label: 'میز ۱', sign: '۱', table: 1, x: -2.35, z: -16.9 },
    { id: 'table-2', kind: 'table', label: 'میز ۲', sign: '۲', table: 2, x: -2.9, z: -43.4 },
]);

export const RUSH_GUESTS = freezeCafe({
    setayesh: { x: 3.55, z: -27.8 },
    uzudi: { x: -3.5, z: -45.5 },
});

export const RECIPES = freezeCafe({
    tea: { name: 'چای هل', icon: 'چ', station: 'bar', time: 1.25, color: '#e0ad63', kind: 'drink' },
    espresso: { name: 'اسپرسو', icon: 'ا', station: 'bar', time: 1.65, color: '#a67a59', kind: 'drink' },
    cake: { name: 'کیک زعفران', icon: 'ک', station: 'pastry', time: 0.95, color: '#f2c95b', kind: 'cake' },
    vip: { name: 'چای هل و اسپرسو', icon: '۲', station: 'bar', time: 2.6, color: '#eb9859', kind: 'pair' },
});

export function rushGround() {
    return createCafeGround({ bounds: RUSH_BOUNDS, radius: 0.44, actors: { player: RUSH_START }, owner: 'cafe-rush' });
}
