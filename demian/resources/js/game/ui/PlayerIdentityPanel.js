/**
 * Optional, server-sourced phone verification panel. Does not request/create
 * an account just to display settings; never echoes or persists OTP digits.
 * A verified competitive score is NOT a coupon and no client-side eligibility
 * can authorize money.
 */
export default class PlayerIdentityPanel {
    constructor({ root, leaderboards }) {
        this.root = root;
        this.leaderboards = leaderboards;
        this.status = root?.querySelector('[data-player-identity-status]');
        this.send = root?.querySelector('[data-player-otp-send]');
        this.form = root?.querySelector('[data-player-otp-form]');
        this.code = this.form?.querySelector('[name="code"]');
        this.submit = this.form?.querySelector('button[type="submit"]');
        this.busy = false;
        this.disposed = false;
        this.onSend = () => this.perform(async () => {
            const response = await this.leaderboards.request('/player/phone/otp', {
                method: 'POST', authenticated: true,
            });
            if (response.status !== 'sent') throw Error('ارسال پیامک تأیید نشد.');
            this.form.hidden = false;
            this.status.textContent = 'پیامک ارسال شد. کد شش‌رقمی حداکثر پنج دقیقه اعتبار دارد. ارسال دوباره پس از یک دقیقه امکان‌پذیر است.';
        });
        this.onSubmit = event => {
            event.preventDefault();
            void this.perform(async () => {
                const code = this.code.value.trim();
                if (!/^[0-9]{6}$/.test(code)) {
                    this.status.textContent = 'کد تأیید باید شش رقم باشد.';
                    return;
                }
                const result = await this.leaderboards.request('/player/phone/verify', {
                    method: 'POST', authenticated: true, body: { code },
                });
                if (result.status !== 'phone_verified') throw Error('تأیید شماره کامل نشد.');
                this.code.value = '';
                this.send.hidden = true;
                this.form.hidden = true;
                this.status.textContent = 'شماره تلفن توسط سرور تأیید شد؛ صدور کوپن همچنان تابع قوانین و نتایج رسمی است.';
            });
        };
        this.send?.addEventListener('click', this.onSend);
        this.form?.addEventListener('submit', this.onSubmit);
    }

    async refresh() {
        if (this.disposed || !this.root) return;
        if (!this.leaderboards?.connected || !this.leaderboards.identity?.token) {
            this.root.hidden = false;
            this.status.textContent = 'برای تأیید شماره، ابتدا حساب آنلاین خود را ثبت یا بازیابی کن. بازی تمرینی بدون حساب در دسترس است.';
            this.send.hidden = true;
            this.form.hidden = true;
            return;
        }
        await this.perform(async () => {
            const state = await this.leaderboards.request('/player/identity', {
                authenticated: true,
            });
            if (this.disposed) return;
            this.root.hidden = false;
            const verified = state.phone_verified === true;
            this.send.hidden = verified || !state.phone_contact_registered || !state.otp_available;
            this.form.hidden = verified || !state.phone_contact_registered || !state.otp_available;
            this.status.textContent = verified
                ? 'شماره تلفن این حساب توسط سرور تأیید شده است. رتبهٔ معتبر به‌تنهایی جایزهٔ قطعی نیست.'
                : state.status === 'guest' ? 'حساب مهمان برای جایزهٔ رسمی واجد شرایط نیست.'
                : !state.phone_contact_registered ? 'برای تأیید و دریافت جوایز رسمی، شماره تلفن را از مسیر ثبت اطلاعات حساب وارد کن.'
                : !state.otp_available ? 'درگاه پیامک هنوز توسط مدیر کافه فعال نشده است؛ تأیید شماره و دریافت جایزه فعلاً در دسترس نیست.'
                : 'شماره ثبت شده ولی هنوز تأیید نشده است؛ ارسال کد پیامکی را انتخاب کن.';
        }, false);
    }

    async perform(action, showError = true) {
        if (this.busy || this.disposed) return;
        this.busy = true;
        if (this.send) this.send.disabled = true;
        if (this.submit) this.submit.disabled = true;
        try { await action(); }
        catch (error) {
            if (showError && this.status && !this.disposed) {
                // No raw gateway response is returned from the server.
                const status = Number(error?.status);
                this.status.textContent = status === 429
                    ? 'تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کن.'
                    : status === 422 ? 'کد نامعتبر یا منقضی است؛ تعداد تلاش‌ها محدود است.'
                    : status === 401 ? 'نشست حساب منقضی شده است؛ ابتدا حساب را بازیابی کن.'
                    : status === 503 ? 'درگاه تأیید پیامک فعلاً در دسترس نیست.'
                    : 'ارتباط با سرور کامل نشد؛ اتصال را بررسی کن.';
            }
        } finally {
            this.busy = false;
            if (this.send) this.send.disabled = false;
            if (this.submit) this.submit.disabled = false;
        }
    }

    dispose() {
        this.disposed = true;
        this.send?.removeEventListener('click', this.onSend);
        this.form?.removeEventListener('submit', this.onSubmit);
        if (this.code) this.code.value = '';
    }
}
