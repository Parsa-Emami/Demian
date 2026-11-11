import { CAFE_ENVIRONMENT_ID, CAFE_REFERENCE_ASSET_ROOT } from '../shared/cafe/CafeEnvironmentContract.js';

// Release gate: archived games remain in source, but cannot be launched.
export const GAME_CATALOG = Object.freeze([
    Object.freeze({
        id: 'open-world', title: 'OPEN WORLD', subtitle: 'کافهٔ دمیان',
        description: 'قدم بزن، بپر و گوشه‌های کافه را کشف کن. پیشرفتت ذخیره می‌شود.',
        icon: '◫', phase: 8, status: 'available', available: true,
        orientation: 'any', accent: 'emerald',
        environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
    }),
    Object.freeze({
        id: 'dino-run', title: 'DINO RUN', subtitle: 'یک پرش دیگر…',
        description: 'در کافه بدو، از صندلی‌ها بپر، زیر چراغ‌ها سر بخور و رکورد بزن. سختی از ۶ شروع می‌شود.',
        icon: '↗', phase: 12, status: 'available', available: true,
        orientation: 'any', accent: 'amber',
        environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
    }),
    Object.freeze({
        id: 'after-hours', title: 'AFTER HOURS', subtitle: 'خاموشی کافه',
        description: 'دو کارت شیفت، سه مدار و یک سایه. برق خروج را وصل کن و پیش از خاموشی فرار کن.',
        icon: 'ϟ', phase: 15, status: 'available', available: true,
        orientation: 'any', accent: 'violet',
        environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
    }),
    Object.freeze({
        id: 'cafe-rush', title: 'CAFÉ RUSH', subtitle: 'سفارش آخر',
        description: 'سفارش را آماده کن، سینی را سالم برسان و شیفت شلوغ کافه را در دو دقیقه جمع کن.',
        icon: '▤', phase: 16, status: 'available', available: true,
        orientation: 'any', accent: 'pink',
        environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
    }),
    Object.freeze({
        id: 'cafe-critters', title: 'CAFÉ CRITTERS', subtitle: 'مهمان‌های ریز کافه',
        description: 'با نگار و پیشی سرنخ‌ها را بخوان، میز کنار پنجره را بچین و دفترچهٔ هشت مهمان را کامل کن.',
        icon: '✦', phase: 17, status: 'available', available: true,
        orientation: 'any', accent: 'sage',
        environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
    }),
    Object.freeze({
        id: 'coffee-crash', title: 'COFFEE CRASH', subtitle: 'جورچین قهوه',
        description: 'خوراکی‌ها را جابه‌جا کن، ترکیب ویژه بساز و سفارش‌های دوازده مرحله را آماده کن.',
        icon: '✧', phase: 18, status: 'available', available: true,
        orientation: 'any', accent: 'coffee',
        environment: CAFE_ENVIRONMENT_ID, environmentLocked: true, referenceAssets: CAFE_REFERENCE_ASSET_ROOT,
    }),
]);

export function findGameCatalogEntry(gameId) {
    return GAME_CATALOG.find((game) => game.id === gameId) ?? null;
}
