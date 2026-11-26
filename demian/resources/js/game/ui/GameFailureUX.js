/**
 * User-facing recovery and record status. Never display raw backend error
 * text, bearer tokens, phone numbers or an unverified prize claim.
 */
export function gameLoadRecovery(error, { online = true } = {}) {
    if (!online) return 'دستگاه آفلاین است. بعضی بازی‌ها در حالت تمرینی قابل اجرا هستند؛ اتصال را بررسی کن و دوباره تلاش کن.';
    const code = String(error?.status ?? error?.statusCode ?? error?.code ?? '');
    const message = String(error?.message ?? '').slice(0, 240).toLowerCase();
    if (['401', '403', '419'].includes(code) || /unauthorized|csrf|session expired|token expired/.test(message)) {
        return 'نشست ورود منقضی شده است. اتصال و ورود دوباره را بررسی کن؛ رکورد این دور تأیید آنلاین نشده است.';
    }
    if (code === '429' || /rate.?limit|too many requests/.test(message)) {
        return 'تعداد درخواست‌ها بیش از حد مجاز است. پس از فاصله‌ای کوتاه دوباره تلاش کن.';
    }
    if (['408','502','503','504'].includes(code) || /timeout|time.?out|failed to fetch|networkerror|network error/.test(message)) {
        return 'ارتباط با سرویس برقرار نشد. اتصال را بررسی کن؛ در صورت امکان حالت تمرینی را انتخاب کن.';
    }
    if (code === '404' || /chunk|image decode|asset not found|manifest/.test(message)) {
        return 'یکی از فایل‌های بازی بارگذاری نشد. صفحه را تازه‌سازی کن و دوباره بازی را انتخاب کن.';
    }
    return 'راه‌اندازی بازی ناموفق بود. به فهرست بازی‌ها برگرد و دوباره تلاش کن؛ امتیاز نامطمئن ثبت نمی‌شود.';
}

const RANKING_MESSAGES = Object.freeze({
    verified: Object.freeze({
        heading: 'رکورد معتبر: سرور نتیجهٔ این دور را تأیید کرد.',
        detail: 'رتبهٔ رسمی فقط در لیدربورد سرور مشخص می‌شود. تأیید رکورد به معنی دریافت کوپن نیست.',
    }),
    practice: Object.freeze({
        heading: 'رکورد تمرینی: فقط روی همین دستگاه قابل مشاهده است.',
        detail: 'این دور به لیدربورد معتبر یا جوایز هفتگی اضافه نمی‌شود.',
    }),
    pending: Object.freeze({
        heading: 'تأیید سرور تکمیل نشد؛ رکورد دستگاه محفوظ است.',
        detail: 'تا تأیید دوباره، نتیجه نباید به عنوان رتبه یا جایزهٔ قطعی نمایش داده شود.',
    }),
    rejected: Object.freeze({
        heading: 'سرور این دور را برای رتبه‌بندی نپذیرفت.',
        detail: 'رکورد دستگاه با رتبهٔ رقابتی متفاوت است؛ صرف بازی‌کردن کوپن ایجاد نمی‌کند.',
    }),
    unknown: Object.freeze({
        heading: 'نتیجهٔ این دور صرفاً در دستگاه نمایش داده می‌شود.',
        detail: 'رتبه و کوپن فقط پس از بررسی سرور و از بخش‌های رسمی مربوط مشخص می‌شوند.',
    }),
});
export function rankingResultUX(status) {
    const key = status === 'beginner-practice' ? 'practice' : status;
    return RANKING_MESSAGES[key] ?? RANKING_MESSAGES.unknown;
}
