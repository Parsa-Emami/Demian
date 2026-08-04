const point = (x, z) => Object.freeze({ x, z });

const collider = (id, x, z, halfX, halfZ, height = 2, kind = 'obstacle') => Object.freeze({
    id,
    kind,
    position: point(x, z),
    halfExtents: point(halfX, halfZ),
    height,
});

export const CAFE_BOUNDS = Object.freeze({ minX: -24, maxX: 24, minZ: -18, maxZ: 18 });
export const CAFE_FLOOR = Object.freeze({ width: 48, depth: 36, color: 0xd7d2c8 });

export const CAFE_STATIC_COLLIDERS = Object.freeze([
    collider('wall-north', 0, -18, 24, 0.5, 4.2, 'wall'),
    collider('wall-south-left', -15, 18, 9, 0.5, 4.2, 'wall'),
    collider('wall-south-right', 15, 18, 9, 0.5, 4.2, 'wall'),
    collider('wall-west', -24, 0, 0.5, 18, 4.2, 'wall'),
    collider('wall-east', 24, 0, 0.5, 18, 4.2, 'wall'),

    collider('column-front-west', -7.2, 0.5, 0.7, 0.7, 4.2, 'column'),
    collider('column-front-east', 7.2, 0.5, 0.7, 0.7, 4.2, 'column'),
    collider('column-back-west', -7.2, -8.2, 0.7, 0.7, 4.2, 'column'),
    collider('column-back-east', 7.2, -8.2, 0.7, 0.7, 4.2, 'column'),

    collider('counter-front', 15.8, 8.0, 6.8, 1.15, 1.18, 'counter'),
    collider('counter-side', 11.65, 1.6, 1.15, 8.65, 1.18, 'counter'),
    collider('counter-backline', 16.2, -0.1, 5.9, 0.8, 1.05, 'counter'),
    collider('pastry-display', -19.0, 10.2, 1.6, 0.95, 1.25, 'display'),
    collider('merch-shelf', -18.5, 12.6, 0.95, 2.35, 2.2, 'shelf'),
    collider('air-conditioner', -18.0, 2.7, 0.5, 0.5, 2.2, 'fixture'),

    collider('communal-table', -11.5, 7.7, 3.4, 5.8, 0.82, 'table'),
    collider('mirror-stand', -2.9, -0.2, 0.6, 0.8, 1.95, 'fixture'),

    collider('rug-table', 5.6, -1.6, 2.1, 1.28, 0.78, 'table'),
    collider('round-table-left', -8.5, -7.5, 1.35, 1.35, 0.76, 'table'),
    collider('round-table-right', 10.8, -7.8, 1.35, 1.35, 0.76, 'table'),
    collider('sofa-west', -18.1, -6.2, 1.25, 4.95, 0.98, 'sofa'),
    collider('armchair-west', -14.3, -11.9, 1.15, 1.15, 0.98, 'sofa'),
    collider('sofa-back', -9.1, -14.25, 3.95, 1.15, 0.98, 'sofa'),
    collider('lounge-table', -11.0, -10.3, 1.45, 0.75, 0.5, 'table'),
    collider('lamp-stand', -15.2, -8.9, 0.38, 0.38, 1.7, 'fixture'),
    collider('plant-lounge', 15.6, -3.2, 0.65, 0.65, 1.55, 'plant'),
    collider('plant-entrance-left', -14.9, 15.5, 0.7, 0.7, 1.35, 'plant'),
    collider('plant-entrance-right', 14.8, 15.5, 0.7, 0.7, 1.35, 'plant'),
    collider('plant-counter', 19.8, 8.5, 0.8, 0.8, 1.45, 'plant'),
]);

export const ROLE_PLAY_NPCS = Object.freeze([
    Object.freeze({ id: 'tiam', name: 'تیام', dialogueId: 'tiam-intro', position: point(-12.8, 5.0), color: 0x22d3ee }),
    Object.freeze({ id: 'ronak', name: 'روناک', dialogueId: 'ronak-shift', position: point(13.4, 4.0), color: 0xf472b6 }),
    Object.freeze({ id: 'amirreza', name: 'امیررضا', dialogueId: 'amirreza-arcade', position: point(8.8, -9.1), color: 0xfbbf24 }),
]);

export const ROLE_PLAY_PICKUPS = Object.freeze([
    Object.freeze({ id: 'coffee-1', itemId: 'coffee-cup', position: point(13.9, 7.5), color: 0xf59e0b }),
    Object.freeze({ id: 'coffee-2', itemId: 'coffee-cup', position: point(15.2, 7.5), color: 0xf59e0b }),
    Object.freeze({ id: 'coffee-3', itemId: 'coffee-cup', position: point(16.5, 7.5), color: 0xf59e0b }),
    Object.freeze({ id: 'repair-kit', itemId: 'repair-kit', position: point(-18.7, 12.2), color: 0x38bdf8 }),
]);

export const ROLE_PLAY_INTERACTABLES = Object.freeze([
    Object.freeze({ id: 'table-04', kind: 'delivery', label: 'تحویل سفارش به میز جمعی', position: point(-11.5, 1.2), radius: 2.3 }),
    Object.freeze({ id: 'counter-pickup', kind: 'repair', label: 'بررسی دستگاه اسپرسو', position: point(13.2, 0.0), radius: 2.25 }),
    Object.freeze({ id: 'save-point', kind: 'save', label: 'ذخیره‌ی پیشرفت', position: point(-11.2, -13.2), radius: 2.0 }),
]);

export const ROLE_PLAY_ZONES = Object.freeze([
    Object.freeze({ id: 'cafe-entrance', position: point(0, 14.2), radius: 2.8 }),
    Object.freeze({ id: 'counter-zone', position: point(14.7, 3.5), radius: 3.2 }),
    Object.freeze({ id: 'lounge-zone', position: point(-12.4, -9.4), radius: 3.6 }),
]);

export const HIDE_SPOTS = Object.freeze([
    Object.freeze({ id: 'behind-counter', label: 'پشت پیشخوان', position: point(12.6, -1.4), exitPosition: point(12.6, 0.2), radius: 1.4, capacity: 1, concealment: 0.95, color: 0xf472b6 }),
    Object.freeze({ id: 'merch-shelf-shadow', label: 'کنار استند محصولات', position: point(-20.8, 12.6), exitPosition: point(-18.8, 12.6), radius: 1.2, capacity: 1, concealment: 0.9, color: 0x22d3ee }),
    Object.freeze({ id: 'communal-table', label: 'زیر میز جمعی', position: point(-11.5, 7.4), exitPosition: point(-8.2, 7.4), radius: 1.15, capacity: 1, concealment: 0.82, color: 0xfb7185 }),
    Object.freeze({ id: 'mirror-corner', label: 'کنار آینه', position: point(-4.2, -0.4), exitPosition: point(-2.4, -0.4), radius: 1.12, capacity: 1, concealment: 0.84, color: 0x67e8f9 }),
    Object.freeze({ id: 'sofa-shadow', label: 'پشت مبل', position: point(-19.4, -6.2), exitPosition: point(-16.9, -6.2), radius: 1.2, capacity: 1, concealment: 0.88, color: 0xc084fc }),
    Object.freeze({ id: 'round-table-left', label: 'پشت میز گرد چپ', position: point(-9.8, -7.5), exitPosition: point(-9.8, -5.6), radius: 1.0, capacity: 1, concealment: 0.8, color: 0xfbbf24 }),
    Object.freeze({ id: 'entrance-planters', label: 'میان گلدان‌های ورودی', position: point(14.9, 15.2), exitPosition: point(12.9, 14.2), radius: 1.1, capacity: 1, concealment: 0.79, color: 0x34d399 }),
    Object.freeze({ id: 'lounge-corner', label: 'گوشه‌ی لانژ', position: point(-16.0, -13.2), exitPosition: point(-14.0, -12.0), radius: 1.15, capacity: 1, concealment: 0.9, color: 0xa78bfa }),
]);

export const HIDE_LIGHT_ZONES = Object.freeze([
    Object.freeze({ id: 'bright-entrance', position: point(0, 14.6), radius: 8.0, lightLevel: 1 }),
    Object.freeze({ id: 'counter-light', position: point(14.8, 3.5), radius: 6.2, lightLevel: 0.72 }),
    Object.freeze({ id: 'lounge-dim', position: point(-13.8, -9.6), radius: 8.0, lightLevel: 0.34 }),
]);

export const HIDE_PATROL_POINTS = Object.freeze([
    point(16, 12),
    point(15, 4),
    point(10, -6),
    point(2, -10),
    point(-10, -12),
    point(-18, -6),
    point(-14, 7),
    point(0, 14),
]);
