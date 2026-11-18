export const RECORD_GAMES = Object.freeze(['dino-run', 'cafe-critters', 'coffee-crash', 'after-hours', 'cafe-rush', 'open-world']);
const numbers = new Intl.NumberFormat('fa-IR');
const timePart = new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2, useGrouping: false });
const valid = value => Number.isSafeInteger(value) && value >= 0;
const number = value => valid(value) ? numbers.format(value) : '—';
const time = value => {
    if (!valid(value)) return '—';
    const tenths = Math.floor(value / 6);
    return `${timePart.format(Math.floor(tenths / 600))}:${timePart.format(Math.floor(tenths / 10) % 60)}٫${numbers.format(tenths % 10)}`;
};

export function recordHeading(game, period, version = '') {
    if (game === 'all-games') return 'امتیاز رقابتی';
    if (version.includes('-route-')) return 'زمان مسیر';
    if (game === 'after-hours') return 'زمان خروج';
    if (game === 'cafe-critters') return 'زمان حل سرنخ‌ها';
    if (game === 'cafe-rush') return 'تحویل سفارش';
    if (game === 'open-world') return 'زمان مسیر';
    return 'امتیاز';
}

export function formatGameRecord(game, row, version = '', mode = 'device') {
    if (game === 'all-games') return number(row.competition_points);
    if (version.includes('-route-') || game === 'cafe-critters' || game === 'after-hours' || game === 'open-world') {
        const duration = time(row.ticks);
        return game === 'after-hours' && mode === 'online' && !version.includes('-route-') && valid(row.score)
            ? `${duration} · ${number(row.score)} امتیاز` : duration;
    }
    if (game === 'cafe-rush') return valid(row.passed)
        ? `${number(row.passed)} سفارش${valid(row.score) ? ` · ${number(row.score)} امتیاز` : ''}` : '—';
    if (game === 'coffee-crash' && valid(row.stage)) return `${number(row.score)} · مرحلهٔ ${number(row.stage)}`;
    return number(row.score);
}

export function deviceMetric(game, row) {
    if (['cafe-critters', 'after-hours', 'open-world'].includes(game)) return valid(row.ticks) && row.ticks > 0 ? -row.ticks : null;
    if (game === 'cafe-rush') return valid(row.passed) && row.passed > 0 ? row.passed : null;
    return valid(row.score) ? row.score : null;
}
