/**
 * Reference-backed walking tour of the café.
 *
 * Coordinates are authored against CafeReferenceLayout.js, not survey measurements.
 * Photographs belong to public/assets/reference/cafe and remain unmodified.
 * Three 2026-10-09 walkthrough videos are not yet frame-verified; never describe
 * these markers as photogrammetry or a dimensionally exact reconstruction.
 */
export const CAFE_REFERENCE_STOPS = Object.freeze([
    {
        id: 'glass-entrance', title: 'درب شیشه‌ای و ورودی',
        position: { x: 3.8, z: 14.4 }, radius: 2.0,
        description: 'درب شیشه‌ای دو لنگه، قاب‌بندی فلزی تیره، نور طبیعی و گلدان‌های دو سوی ورودی.',
        references: ['06-front-glass-and-communal-table.jpg'],
    },
    {
        id: 'main-hall', title: 'سالن اصلی',
        position: { x: 2.0, z: 9.0 }, radius: 2.0,
        description: 'کف سرامیک روشن با بندکشی، سقف شبکه‌ای، چراغ‌های خطی، دیوارهای خاکستری و ستون‌های میانی.',
        references: ['05-main-hall-wide-view.jpg'],
    },
    {
        id: 'communal-table', title: 'میز جمعی و کتاب‌ها',
        position: { x: -7.0, z: 8.0 }, radius: 2.0,
        description: 'میز چوبی کشیده، صندلی‌های چوبی و کتابخانه‌ی دیواری کنار پنجره‌ی ورودی.',
        references: ['10-bookshelf-and-communal-table.jpg', '06-front-glass-and-communal-table.jpg'],
    },
    {
        id: 'merchandise', title: 'ویترین و استند محصولات',
        position: { x: -15.5, z: 12.7 }, radius: 2.0,
        description: 'استند محصولات، بخش شیرینی و دکور چوبی کنار ورودی.',
        references: ['08-merchandise-shelf.jpg'],
    },
    {
        id: 'mirror-rug', title: 'فرش، آینه و میز گفتگو',
        position: { x: 1.2, z: -0.9 }, radius: 2.0,
        description: 'فرش نقش‌دار زرشکی، میز و صندلی‌های چوبی، آینه‌ی قدی و قاب‌های عکس روی دیوار.',
        references: ['07-rug-table-and-mirror.jpg'],
    },
    {
        id: 'lounge', title: 'لانژ و نشیمن',
        position: { x: -12.8, z: -5.0 }, radius: 2.3,
        description: 'مبل‌های پارچه‌ای تیره، میز کوتاه، نور گرم دیوارکوب، چراغ ایستاده و بخش آرام گفتگو.',
        references: ['01-lounge-entry-view.jpg', '02-lounge-seating-view.jpg', '03-lounge-to-counter-view.jpg'],
    },
    {
        id: 'service-front', title: 'پیشخوان سفارش',
        position: { x: 8.7, z: 7.4 }, radius: 2.1,
        description: 'پیشخوان بلند با صفحه‌ی چوبی، بدنه‌ی روشن، نمایشگر سفارش، ویترین و وسایل سرو.',
        references: ['09-counter-service-side.jpg', '05-main-hall-wide-view.jpg'],
    },
    {
        id: 'service-back', title: 'بخش آماده‌سازی و سرویس‌دهی',
        position: { x: 8.1, z: 1.7 }, radius: 2.0,
        description: 'کاشی‌های سبز پشت بار، قفسه‌ی بطری‌ها، دستگاه اسپرسو، آسیاب، سینک و لوازم آماده‌سازی.',
        references: ['04-counter-close-view.jpg', '09-counter-service-side.jpg'],
    },
].map((stop) => Object.freeze({
    ...stop,
    position: Object.freeze(stop.position),
    references: Object.freeze(stop.references),
})));

export const CAFE_REFERENCE_ROOT = '/assets/reference/cafe';

export function referencePhotoUrl(filename) {
    // Filenames come from the static allowlist above, never arbitrary input.
    return `${CAFE_REFERENCE_ROOT}/${filename}`;
}

export function referenceStopsInBounds(bounds) {
    return CAFE_REFERENCE_STOPS.every(({ position }) =>
        position.x >= bounds.minX && position.x <= bounds.maxX &&
        position.z >= bounds.minZ && position.z <= bounds.maxZ
    );
}
