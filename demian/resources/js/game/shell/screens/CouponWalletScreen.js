import BaseScreen from './BaseScreen.js';

const statuses = Object.freeze({
    issued: 'معتبر و قابل استفاده',
    reserved: 'رزرو شده برای خرید حضوری',
    redeemed: 'استفاده شده',
    expired: 'منقضی شده',
    revoked: 'لغو شده',
});
const formatNumber = value => Number.isSafeInteger(Number(value))
    && Number(value) >= 0
    ? new Intl.NumberFormat('fa-IR').format(Number(value)) : '—';

function safeExpiry(value) {
    const date = Date.parse(value ?? '');
    if (!Number.isFinite(date)) return 'نامشخص';
    return new Intl.DateTimeFormat('fa-IR', {
        timeZone: 'Asia/Tehran', dateStyle: 'medium',
    }).format(date);
}

/**
 * The user requested a dedicated account-owned in-app discount page, NOT
 * email delivery. Its only data source is the bearer-protected wallet GET.
 * Clear all secrets on close; ignore responses after dismissal/account switch.
 */
export default class CouponWalletScreen extends BaseScreen {
    constructor({ service, ...options }) {
        super({ ...options, layer: 'modal' });
        this.service = service;
        this.list = this.element.querySelector('[data-wallet-list]');
        this.status = this.element.querySelector('[data-wallet-status]');
        this.refreshButton = this.element.querySelector('[data-wallet-refresh]');
        this.restoreHint = this.element.querySelector('[data-wallet-restore-hint]');
        this.generation = 0;
        this.onRefresh = () => void this.load();
        this.onCopy = async event => {
            const button = event.target.closest('[data-wallet-copy]');
            if (!button) return;
            const input = button.parentElement?.querySelector('input[data-wallet-code]');
            if (!input?.value || !/^DMC-[A-F0-9]{32}$/.test(input.value)) return;
            const generation = this.generation;
            try {
                if (!globalThis.navigator?.clipboard?.writeText) {
                    input.focus(); input.select();
                    this.status.textContent = 'کد انتخاب شد؛ از فرمان کپی دستگاه استفاده کنید.';
                    return;
                }
                await globalThis.navigator.clipboard.writeText(input.value);
                if (generation === this.generation) {
                    this.status.textContent = 'کد تخفیف کپی شد. فقط هنگام خرید حضوری استفاده کنید.';
                }
            } catch {
                if (generation === this.generation) {
                    input.focus(); input.select();
                    this.status.textContent = 'امکان کپی مستقیم وجود ندارد؛ کد انتخاب شد.';
                }
            }
        };
        this.onSupport = async event => {
            const button = event.target.closest('[data-wallet-ack], [data-wallet-dispute]');
            if (!button || button.disabled) return;
            const card = button.closest('[data-wallet-coupon-id]');
            const couponId = Number(card?.dataset.walletCouponId);
            if (!Number.isSafeInteger(couponId) || couponId < 1) return;
            const generation = this.generation;
            const token = this.service.identity?.token;
            const owner = this.service.identity?.player_id;
            if (!token || !owner) return;
            button.disabled = true;
            try {
                if (button.hasAttribute('data-wallet-ack')) {
                    await this.service.acknowledgeCoupon(couponId);
                } else {
                    const category = card.querySelector('[data-wallet-case-category]')?.value;
                    const description = card.querySelector('[data-wallet-case-description]')?.value ?? '';
                    await this.service.reportCoupon(couponId, category, description);
                }
                if (generation !== this.generation
                    || this.service.identity?.token !== token
                    || this.service.identity?.player_id !== owner) return;
                await this.load();
            } catch {
                if (generation === this.generation
                    && this.service.identity?.token === token
                    && this.service.identity?.player_id === owner) {
                    this.status.textContent = 'ثبت درخواست ناموفق بود؛ وضعیت حساب، اتصال یا پرونده باز را بررسی کنید.';
                    button.disabled = false;
                }
            }
        };
        this.refreshButton?.addEventListener('click', this.onRefresh);
        this.list?.addEventListener('click', this.onCopy);
        this.list?.addEventListener('click', this.onSupport);
    }

    async beforeOpen() {
        this.clear();
        await this.load();
    }

    clear() {
        this.generation++;
        this.list?.replaceChildren();
        if (this.refreshButton) this.refreshButton.disabled = false;
        if (this.status) this.status.textContent = '';
    }

    async load() {
        const generation = ++this.generation;
        const owner = this.service.identity?.player_id;
        const token = this.service.identity?.token;
        this.list?.replaceChildren();
        if (this.restoreHint) this.restoreHint.hidden = Boolean(token && owner && this.service.connected);
        if (!this.service.connected) {
            this.status.textContent = 'این نسخه به سرور متصل نیست؛ کدهای خصوصی فقط از سرور امن دریافت می‌شوند.';
            return;
        }
        if (!token || !owner) {
            this.status.textContent = this.service.needsAccountRestore
                ? 'برای دیدن تخفیف‌های خود، حساب اصلی را از بخش لیدربورد بازیابی کنید.'
                : 'برای دریافت کد تخفیف، ابتدا با حساب آنلاین خود بازی کنید یا حساب را بازیابی کنید.';
            return;
        }
        this.status.textContent = 'در حال دریافت کدهای تخفیف اختصاصی از سرور…';
        if (this.refreshButton) this.refreshButton.disabled = true;
        try {
            const coupons = await this.service.myCoupons();
            // Never display a previous account's response after token rotation,
            // deletion, logout or closing this modal.
            if (generation !== this.generation || this.service.identity?.token !== token
                || this.service.identity?.player_id !== owner) return;
            this.status.textContent = coupons.length
                ? 'کدها فقط در همین صفحه به صاحب حساب نشان داده می‌شوند؛ ایمیلی ارسال نمی‌شود.'
                : 'هنوز کد تخفیفی برای حساب شما صادر نشده است. نتایج نهایی مسابقات و جوایز تأییدشده اینجا نمایش داده می‌شوند.';
            for (const coupon of coupons) this.list.append(this.createCard(coupon));
        } catch {
            if (generation === this.generation) {
                this.status.textContent = 'دریافت تخفیف‌ها ناموفق بود؛ وضعیت اتصال یا حساب را بررسی کنید.';
                this.list?.replaceChildren();
                if (this.restoreHint) this.restoreHint.hidden = !this.service.needsAccountRestore;
            }
        } finally {
            if (generation === this.generation && this.refreshButton) {
                this.refreshButton.disabled = false;
            }
        }
    }

    createCard(coupon) {
        const card = document.createElement('li');
        card.className = 'wallet-card';
        const status = Object.hasOwn(statuses, coupon.status) ? coupon.status : 'revoked';
        card.dataset.walletState = status;
        const couponId = Number(coupon.coupon_id);
        if (Number.isSafeInteger(couponId) && couponId > 0) {
            card.dataset.walletCouponId = String(couponId);
        }

        const header = document.createElement('div');
        header.className = 'wallet-card__header';
        const title = document.createElement('strong');
        const gift = coupon.source === 'gift';
        title.textContent = 'تخفیف ' + formatNumber(coupon.discount_percent)
            + '٪ · ' + (gift ? 'هدیه کافه'
                : 'جایزه رتبه ' + formatNumber(coupon.prize_rank));
        const badge = document.createElement('span');
        badge.className = 'wallet-card__state';
        badge.textContent = statuses[status];
        header.append(title, badge);
        card.append(header);

        const meta = document.createElement('p');
        meta.className = 'wallet-card__meta';
        meta.textContent = (gift ? 'هدیه اختصاصی' : 'مسابقه: ' + String(coupon.game_id ?? '—')
            + ' · هفته ' + String(coupon.period_key ?? '—').replace('weekly:tehran:', ''))
            + ' · اعتبار تا: ' + safeExpiry(coupon.expires_at);
        card.append(meta);

        const cap = document.createElement('p');
        cap.className = 'wallet-card__meta';
        cap.textContent = 'سقف تخفیف: ' + formatNumber(coupon.max_discount_minor)
            + ' ' + String(coupon.currency ?? '') + ' · حداقل سفارش: '
            + formatNumber(coupon.min_order_minor) + ' ' + String(coupon.currency ?? '');
        card.append(cap);

        // Backend never exposes spent/revoked/expired codes. Fail closed even
        // if a malformed upstream response accidentally includes one.
        if (['issued', 'reserved'].includes(status)
            && typeof coupon.code === 'string'
            && /^DMC-[A-F0-9]{32}$/.test(coupon.code)) {
            const codeRow = document.createElement('div');
            codeRow.className = 'wallet-card__code';
            const field = document.createElement('input');
            field.type = 'text';
            field.readOnly = true;
            field.autocomplete = 'off';
            field.spellcheck = false;
            field.dir = 'ltr';
            field.dataset.walletCode = '';
            field.setAttribute('aria-label', 'کد تخفیف شما');
            field.value = coupon.code;
            field.addEventListener('focus', () => field.select());
            const copy = document.createElement('button');
            copy.type = 'button';
            copy.className = 'shell-button shell-button--ghost';
            copy.dataset.walletCopy = '';
            copy.textContent = 'کپی کد';
            codeRow.append(field, copy);
            card.append(codeRow);
        }
        if (coupon.support_enabled === true && Number.isSafeInteger(couponId)
            && couponId > 0) {
            const received = document.createElement('p');
            received.className = 'wallet-card__meta';
            if (coupon.acknowledged_at) {
                received.textContent = 'دریافت و مشاهده جایزه ثبت شده است.';
            } else {
                const ack = document.createElement('button');
                ack.type = 'button';
                ack.className = 'shell-button shell-button--ghost';
                ack.dataset.walletAck = '';
                ack.textContent = 'تأیید دریافت جایزه';
                received.append(ack);
            }
            card.append(received);

            const caseState = coupon.case_status;
            if (caseState === 'open') {
                const notice = document.createElement('p');
                notice.className = 'wallet-card__meta';
                notice.textContent = 'درخواست رسیدگی #' + formatNumber(coupon.case_id)
                    + ' ثبت شده و در انتظار بررسی است.';
                card.append(notice);
            } else {
                if (caseState === 'resolved' || caseState === 'rejected') {
                    const result = document.createElement('p');
                    result.className = 'wallet-card__meta';
                    result.textContent = 'وضعیت آخرین درخواست: '
                        + (caseState === 'resolved' ? 'رسیدگی شده' : 'رد شده');
                    card.append(result);
                }
                const category = document.createElement('select');
                category.dataset.walletCaseCategory = '';
                category.setAttribute('aria-label', 'موضوع درخواست رسیدگی');
                for (const [value, label] of [
                    ['not_received', 'جایزه دریافت نشده'],
                    ['invalid_code', 'کد نامعتبر'],
                    ['redemption', 'مشکل هنگام مصرف در کافه'],
                    ['terms', 'ابهام در شرایط تخفیف'],
                    ['other', 'سایر موارد'],
                ]) {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = label;
                    category.append(option);
                }
                const description = document.createElement('textarea');
                description.dataset.walletCaseDescription = '';
                description.maxLength = 300;
                description.rows = 2;
                description.placeholder = 'توضیح کوتاه؛ کد تخفیف یا اطلاعات شخصی را وارد نکنید';
                description.setAttribute('aria-label', 'توضیح اختیاری درخواست رسیدگی');
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'shell-button shell-button--ghost';
                button.dataset.walletDispute = '';
                button.textContent = 'ارسال درخواست رسیدگی';
                card.append(category, description, button);
            }
        }
        return card;
    }

    async beforeClose() {
        this.clear();
    }

    dispose() {
        this.clear();
        this.refreshButton?.removeEventListener('click', this.onRefresh);
        this.list?.removeEventListener('click', this.onCopy);
        this.list?.removeEventListener('click', this.onSupport);
        super.dispose();
    }
}
