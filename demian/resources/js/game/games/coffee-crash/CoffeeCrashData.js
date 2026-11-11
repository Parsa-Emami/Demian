export const COLS = 7;
export const ROWS = 8;
export const INGREDIENTS = Object.freeze([
    Object.freeze({ id: 'espresso', label: 'اسپرسو', color: '#85513b' }),
    Object.freeze({ id: 'latte', label: 'لاته', color: '#cf9a58' }),
    Object.freeze({ id: 'berry', label: 'بری یخی', color: '#d75287' }),
    Object.freeze({ id: 'lavender', label: 'لاوندر', color: '#9a7ac4' }),
    Object.freeze({ id: 'croissant', label: 'کروسان', color: '#c98135' }),
]);
const names = ['اولین فنجان', 'صبحِ آرام', 'کنار پنجره', 'عطرِ لاوندر', 'وقتِ کروسان', 'دو سفارش', 'میزِ دوستان', 'عصرِ بارانی', 'سفارشِ رنگی', 'شیفتِ شلوغ', 'مهمانیِ کافه', 'باریستای دمیان'];
export const LEVELS = Object.freeze(names.map((name, index) => Object.freeze({
    id: index + 1,
    name,
    seed: 83071 + index * 7919,
    moves: 24 + Math.floor(index / 4) * 2,
    goals: Object.freeze(Array.from({ length: index < 2 ? 1 : index < 6 ? 2 : 3 }, (_, goal) => Object.freeze({
        type: (index + goal * 2) % INGREDIENTS.length,
        count: 12 + Math.floor(index / 3) * 3 + goal * 2,
    }))),
})));
export const SPECIAL_LABELS = Object.freeze({ row: 'راه‌راه افقی', column: 'راه‌راه عمودی', bomb: 'بمب قهوه', rainbow: 'فنجان رنگین' });
export const digits = new Intl.NumberFormat('fa-IR', { useGrouping: false });
