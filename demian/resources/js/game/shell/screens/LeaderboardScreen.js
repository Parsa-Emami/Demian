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
        this.recovery = this.element.querySelector('[data-ranking-recovery]');
        this.recoveryForm = this.element.querySelector('[data-ranking-recover-form]');
        this.issueRecovery = this.element.querySelector('[data-ranking-issue-recovery]');
        this.recoveryLink = this.element.querySelector('[data-ranking-recovery-link]');
        this.recoveryStatus = this.element.querySelector('[data-ranking-recovery-status]');
        this.deleteAccount = this.element.querySelector('[data-ranking-delete-account]');
        this.timer = null;
        this.snapshot = null;
        this.receivedAtMs = 0;
        this.nextRefreshAt = 0;
        this.loading = false;
        this.lastForcedRolloverKey = null;
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
        this.onIssueRecovery = async () => {
            this.issueRecovery.disabled = true;
            this.recoveryLink.value = '';
            try {
                const link = await this.service.issueRecoveryLink();
                this.recoveryLink.value = link;
                this.recoveryLink.focus();
                this.recoveryLink.select();
                this.recoveryStatus.textContent = 'لینک فقط یک بار و تا زمان انقضای اعلام‌شده از سمت سرور قابل استفاده است. آن را در جای امن ذخیره کن؛ ساخت لینک تازه، قبلی را باطل می‌کند.';
            } catch (error) {
                this.recoveryStatus.textContent = error.message;
            } finally {
                this.issueRecovery.disabled = false;
            }
        };
        this.onRecover = async event => {
            event.preventDefault();
            const button = this.recoveryForm.querySelector('button[type="submit"]');
            button.disabled = true;
            try {
                const code = this.recoveryForm.elements.recovery_code.value;
                const recovered = await this.service.recoverAccount(code);
                this.recoveryForm.reset();
                this.form.elements.display_name.value = recovered.display_name;
                await this.load();
                this.recoveryStatus.textContent = 'حساب بازیابی شد؛ نشست قبلی و لینک یک‌بارمصرف باطل شدند.';
            } catch (error) {
                this.recoveryStatus.textContent = error.message;
            } finally {
                button.disabled = false;
            }
        };
        this.onDeleteAccount = async () => {
            if (!globalThis.confirm?.('حساب، تمام رکوردهای جهانی و داده‌های این دستگاه برای همیشه حذف می‌شوند. ادامه می‌دهی؟')) return;
            this.deleteAccount.disabled = true;
            try {
                await this.service.eraseAccount();
                this.recoveryLink.value = '';
                this.recoveryForm.reset();
                this.recoveryStatus.textContent = 'حساب و داده‌های آن پس از تأیید سرور حذف شدند.';
                this.form.elements.display_name.value = this.service.displayName;
                await this.load();
            } catch (error) {
                this.recoveryStatus.textContent = error.message;
            } finally {
                this.deleteAccount.disabled = false;
            }
        };
        this.deleteAccount?.addEventListener('click', this.onDeleteAccount);
        this.issueRecovery.addEventListener('click', this.onIssueRecovery);
        this.recoveryForm.addEventListener('submit', this.onRecover);
        this.period.addEventListener('change', this.onPeriod);
        this.form.addEventListener('submit', this.onSubmit);
    }

    async beforeOpen() {
        this.form.elements.display_name.value = this.service.displayName;
        this.issueRecovery.disabled = !this.service.connected;
        this.deleteAccount.disabled = !this.service.connected;
        for (const control of this.recoveryForm.elements) control.disabled = !this.service.connected;
        this.recoveryForm.elements.recovery_code.value = this.service.recoveryOffer ?? '';
        this.recoveryLink.value = '';
        this.recoveryStatus.textContent = this.service.recoveryOffer
            ? 'کد بازیابی لینک شناسایی شد؛ برای تعویض حساب روی «بازیابی حساب» بزنید.'
            : this.service.needsAccountRestore
                ? 'حساب قبلی در این نشست باز نیست. برای حفظ رکوردهای آن باید با کد بازیابی وارد شوی.'
                : 'توکن ورود فقط در نشست مرورگر نگهداری می‌شود. قبل از بستن مرورگر، لینک بازیابی را دریافت و امن ذخیره کن.';
        for (const option of this.period.options) {
            option.disabled = !this.service.connected && option.value !== 'device';
        }
        this.period.value = this.service.connected ? 'weekly' : 'device';
        this.snapshot = null;
        this.lastForcedRolloverKey = null;
        this.nextRefreshAt = this.monotonicNow() + 60000;
        if (this.service.pending) await this.service.retry();
        await this.load();
        if (this.timer == null) this.timer = setInterval(() => this.tick(), 1000);
    }

    monotonicNow() { return globalThis.performance?.now?.() ?? Date.now(); }

    tick() {
        const remaining = this.renderCountdown();
        if (this.element.hidden || globalThis.document?.visibilityState === 'hidden') return;
        const now = this.monotonicNow();
        // Poll every minute; at the weekly rollover refresh as soon as the
        // clock reaches zero instead of displaying the expired week's ranks.
        const expiredKey = this.snapshot?.period_key;
        if (remaining === 0 && this.period.value === 'weekly' && expiredKey
            && this.lastForcedRolloverKey !== expiredKey) {
            // At most one extra request per expired season, even if a stale API
            // response keeps reporting the previous boundary for a few seconds.
            this.lastForcedRolloverKey = expiredKey;
            this.nextRefreshAt = now;
        }
        if (!this.loading && now >= this.nextRefreshAt) void this.load();
    }

    renderCountdown() {
        const isWeekly = this.period.value === 'weekly' && this.service.connected;
        this.countdown.hidden = !isWeekly;
        if (!isWeekly) return null;
        const remaining = remainingWeeklySeconds(this.snapshot, this.receivedAtMs, this.monotonicNow());
        this.countdown.textContent = remaining == null
            ? 'زمان پایان هفته در انتظار سرور'
            : `تا پایان رقابت این هفته: ${formatWeeklyCountdown(remaining)}`;
        return remaining;
    }

    async load() {
        const generation = ++this.generation;
        this.loading = true;
        this.nextRefreshAt = this.monotonicNow() + 60000;
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
            this.receivedAtMs = this.monotonicNow();
            this.status.textContent = result.mode === 'device'
                ? 'رکوردهای همین مرورگر؛ ثبت جهانی نشده‌اند.'
                : 'امتیازهای تأییدشده توسط سرور · شروع هفته شنبه ساعت ۰۰:۰۰ به وقت تهران';
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
                ? own?.best
                    ? `رتبهٔ تأییدشده شما: ${own.my_rank == null ? '—' : new Intl.NumberFormat('fa-IR').format(own.my_rank)} از ${new Intl.NumberFormat('fa-IR').format(own.participants ?? 0)} · رکورد: ${new Intl.NumberFormat('fa-IR').format(own.best.score)}`
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
        this.recoveryLink.value = '';
        if (this.timer != null) clearInterval(this.timer);
        this.timer = null;
    }

    dispose() {
        this.generation++;
        if (this.timer != null) clearInterval(this.timer);
        this.timer = null;
        this.deleteAccount?.removeEventListener('click', this.onDeleteAccount);
        this.issueRecovery.removeEventListener('click', this.onIssueRecovery);
        this.recoveryForm.removeEventListener('submit', this.onRecover);
        this.period.removeEventListener('change', this.onPeriod);
        this.form.removeEventListener('submit', this.onSubmit);
        super.dispose();
    }
}
