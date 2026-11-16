import BaseScreen from './BaseScreen';

const TIPS = Object.freeze({
    'open-world': [
        'با حرکت آرام شروع کن؛ جزئیات محیط بعد از صحنهٔ اصلی آماده می‌شوند.',
        'در Open World می‌توانی محیط کافه را آزادانه کشف کنی.',
        'اگر اینترنت ضعیف است، حالت سبک در تنظیمات به پایداری کمک می‌کند.',
    ],
    'dino-run': ['برای پرش، ضربهٔ کوتاه بزن.', 'زمان‌بندی مهم‌تر از عجله است.', 'رکورد رسمی فقط بعد از تأیید سرور ثبت می‌شود.'],
    'after-hours': ['به نشانه‌های محیط دقت کن.', 'با حرکت‌های کوتاه کنترل دقیق‌تری داری.', 'پیش از شروع می‌توانی راهنما را ببینی.'],
    'cafe-rush': ['اول مسیر را ببین، سپس سرعت بگیر.', 'در صفحه‌های کوچک کنترل لمسی در دسترس است.'],
    'cafe-critters': ['سرنخ‌ها را دنبال کن.', 'هر مرحله فرصت کشف یک جزئیات تازه است.'],
    'coffee-crash': ['هر حرکت را با دقت انتخاب کن.', 'تمرین آفلاین هم در دسترس است.'],
    default: [
        'بازی روی دستگاه تو اجرا می‌شود؛ لودینگ منتظر منابع ضروری است.',
        'در اولین ورود تصاویر و کد دریافت می‌شوند؛ دفعات بعد معمولاً سریع‌تر است.',
        'نوار مرحله فقط پس از تکمیل واقعی کار جلو می‌رود.',
    ],
});

/**
 * Progress is based on completed game lifecycle stages, not fake bytes.
 * The alive clock and user-controlled tips run without game-state writes.
 */
export default class LoadingScreen extends BaseScreen {
    constructor(options) {
        super(options);
        this.title = this.element.querySelector('[data-loading-title]');
        this.step = this.element.querySelector('[data-loading-step]');
        this.bar = this.element.querySelector('[data-loading-progress-bar]');
        this.value = this.element.querySelector('[data-loading-progress-value]');
        this.phase = this.element.querySelector('[data-loading-phase]');
        this.elapsed = this.element.querySelector('[data-loading-elapsed]');
        this.health = this.element.querySelector('[data-loading-health]');
        this.tipText = this.element.querySelector('[data-loading-tip-text]');
        this.tipButton = this.element.querySelector('[data-loading-tip-next]');
        this.stage = 0;
        this.tipIndex = 0;
        this.gameId = null;
        this.timer = null;
        this.startedAt = 0;
        this.onNextTip = () => this.nextTip();
        this.tipButton?.addEventListener('click', this.onNextTip);
    }

    async beforeOpen(payload = {}) {
        this.clearTimer();
        this.gameId = payload.gameId ?? null;
        this.tipIndex = 0;
        this.startedAt = globalThis.performance?.now?.() ?? Date.now();
        if (this.title) this.title.textContent = payload.title ?? 'آماده‌سازی بازی';
        this.setProgress(payload.progress ?? 0, payload.step ?? 'در حال شروع بارگذاری…');
        if (this.health) this.health.textContent = 'در حال بررسی منابع ضروری…';
        this.refreshTip();
        this.updateElapsed();
    }

    async afterOpen() {
        this.updateElapsed();
        this.timer = globalThis.setInterval(() => this.updateElapsed(), 1000);
    }

    async beforeClose() {
        this.clearTimer();
    }

    clearTimer() {
        if (this.timer !== null) globalThis.clearInterval(this.timer);
        this.timer = null;
    }

    updateElapsed() {
        const now = globalThis.performance?.now?.() ?? Date.now();
        const seconds = Math.max(0, Math.floor((now - this.startedAt) / 1000));
        if (this.elapsed) this.elapsed.textContent = seconds.toLocaleString('fa-IR') + ' ثانیه';
        if (seconds >= 8 && this.stage < 4 && this.health) {
            this.health.textContent = seconds >= 20
                ? 'این مرحله بیشتر از معمول طول کشیده؛ اتصال و بارگذاری منابع را بررسی کن.'
                : 'هنوز در حال آماده‌سازی هستیم؛ مرحلهٔ فعلی تکمیل نشده است.';
        }
    }

    setProgress(progress, step) {
        const safe = Math.min(100, Math.max(0, Number(progress) || 0));
        const completed = Math.min(4, Math.floor(safe / 25));
        this.stage = completed;
        this.bar?.style.setProperty('--loading-progress', safe + '%');
        this.bar?.setAttribute('aria-valuenow', String(Math.round(safe)));
        this.bar?.setAttribute('aria-valuetext', completed + ' از ۴ مرحله انجام شد' + (step ? '؛ ' + step : ''));
        if (this.value) this.value.textContent = completed.toLocaleString('fa-IR') + ' / ۴';
        if (this.phase) this.phase.textContent = completed === 4
            ? 'همهٔ مراحل آماده است'
            : 'مرحلهٔ ' + (completed + 1).toLocaleString('fa-IR') + ' از ۴';
        if (step && this.step) this.step.textContent = step;
        if (completed === 4 && this.health) this.health.textContent = 'آمادهٔ شروع؛ وارد بازی می‌شوی.';
    }

    refreshTip() {
        const list = TIPS[this.gameId] ?? TIPS.default;
        if (this.tipText) this.tipText.textContent = list[this.tipIndex % list.length];
    }

    nextTip() {
        this.tipIndex++;
        this.refreshTip();
    }

    dispose() {
        this.clearTimer();
        this.tipButton?.removeEventListener('click', this.onNextTip);
        super.dispose();
    }
}
