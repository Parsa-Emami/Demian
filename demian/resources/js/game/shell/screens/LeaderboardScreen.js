import BaseScreen from './BaseScreen.js';
import { remainingWeeklySeconds, formatWeeklyCountdown } from '../../leaderboard/WeeklyCountdown.js';

export default class LeaderboardScreen extends BaseScreen {
    constructor({ service, ...options }) {
        super({ ...options, layer: 'modal' });
        this.service = service;
        this.generation = 0;
        this.period = this.element.querySelector('[data-ranking-period]');
        this.body = this.element.querySelector('[data-ranking-rows]');
        this.status = this.element.querySelector('[data-ranking-status]');
        this.countdown = this.element.querySelector('[data-ranking-countdown]');
        this.personalBest = this.element.querySelector('[data-ranking-personal-best]');
        this.form = this.element.querySelector('[data-ranking-name-form]');
        this.timer = null;
        this.snapshot = null;
        this.receivedAtMs = 0;
        this.nextRefreshAt = 0;
        this.loading = false;
        this.onPeriod = () => this.load();
        this.onSubmit = async event => {
            event.preventDefault();
            const button = this.form.querySelector('button');
            button.disabled = true;
            try {
                await this.service.rename(this.form.elements.display_name.value);
                this.status.textContent = 'نام نمایشی ذخیره شد.';
            } catch (error) {
                this.status.textContent = error.message;
            } finally {
                button.disabled = false;
            }
        };
        this.period.addEventListener('change', this.onPeriod);
        this.form.addEventListener('submit', this.onSubmit);
    }

    async beforeOpen() {
        this.form.elements.display_name.value = this.service.displayName;
        for (const option of this.period.options) {
            option.disabled = !this.service.connected && option.value !== 'device';
        }
        this.period.value = this.service.connected ? 'weekly' : 'device';
        this.snapshot = null;
        this.nextRefreshAt = Date.now() + 60000;
        await this.load();
        if (this.timer == null) this.timer = setInterval(() => this.tick(), 1000);
    }

    tick() {
        const remaining = this.renderCountdown();
        if (this.element.hidden || globalThis.document?.visibilityState === 'hidden') return;
        const now = Date.now();
        // Poll every minute; at the weekly rollover refresh as soon as the
        // clock reaches zero instead of displaying the expired week's ranks.
        if (remaining === 0 && this.period.value === 'weekly' && now < this.nextRefreshAt) {
            this.nextRefreshAt = now;
        }
        if (!this.loading && now >= this.nextRefreshAt) void this.load();
    }

    renderCountdown() {
        const isWeekly = this.period.value === 'weekly' && this.service.connected;
        this.countdown.hidden = !isWeekly;
        if (!isWeekly) return null;
        const remaining = remainingWeeklySeconds(this.snapshot, this.receivedAtMs);
        this.countdown.textContent = remaining == null
            ? 'زمان پایان هفته در انتظار سرور'
            : `تا پایان رقابت این هفته: ${formatWeeklyCountdown(remaining)}`;
        return remaining;
    }

    async load() {
        const generation = ++this.generation;
        this.loading = true;
        this.nextRefreshAt = Date.now() + 60000;
        this.status.textContent = 'در حال خواندن رکوردها…';
        this.personalBest.textContent = '';
        this.body.replaceChildren();
        this.snapshot = null;
        this.renderCountdown();
        try {
            const ownScore = this.period.value !== 'device'
                ? this.service.personalBest(this.period.value) : Promise.resolve(null);
            const result = await this.service.list(this.period.value);
            if (generation !== this.generation) return;
            this.snapshot = result.mode === 'online' ? result : null;
            this.receivedAtMs = Date.now();
            this.status.textContent = result.mode === 'device'
                ? 'رکوردهای همین مرورگر؛ ثبت جهانی نشده‌اند.'
                : 'امتیازهای تأییدشده توسط سرور · شروع هفته دوشنبه ساعت ۰۰:۰۰ UTC';
            if (!result.data.length) this.status.textContent += ' هنوز رکوردی ثبت نشده است.';
            for (const row of result.data) {
                const tr = document.createElement('tr');
                for (const value of [row.rank, row.display_name, row.score]) {
                    const td = document.createElement('td');
                    td.textContent = String(value);
                    tr.append(td);
                }
                this.body.append(tr);
            }
            this.renderCountdown();
            const own = await ownScore;
            if (generation !== this.generation) return;
            this.personalBest.textContent = result.mode === 'online'
                ? own?.best ? `رکورد تأییدشده شما در این دوره: ${new Intl.NumberFormat('fa-IR').format(own.best.score)}`
                    : 'هنوز رکورد تأییدشده‌ای برای این دوره نداری.'
                : '';
        } catch {
            if (generation === this.generation) {
                this.status.textContent = 'سرور در دسترس نیست. «این دستگاه» را انتخاب کن یا دوباره تلاش کن.';
                this.renderCountdown();
            }
        } finally {
            if (generation === this.generation) this.loading = false;
        }
    }

    async beforeClose() {
        this.generation++;
        this.loading = false;
        this.snapshot = null;
        if (this.timer != null) clearInterval(this.timer);
        this.timer = null;
    }

    dispose() {
        this.generation++;
        if (this.timer != null) clearInterval(this.timer);
        this.timer = null;
        this.period.removeEventListener('change', this.onPeriod);
        this.form.removeEventListener('submit', this.onSubmit);
        super.dispose();
    }
}
