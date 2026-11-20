const NAMES = Object.freeze({bronze:'برنز',silver:'نقره',gold:'طلا',legend:'افسانه‌ای',placement:'در انتظار تعیین سطح'});
export function formatLeagueName(tier) {
    return Object.hasOwn(NAMES,tier) ? NAMES[tier] : 'نامشخص';
}
