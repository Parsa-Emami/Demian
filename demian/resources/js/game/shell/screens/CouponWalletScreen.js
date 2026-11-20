import BaseScreen from './BaseScreen.js';

const digits = new Intl.NumberFormat('fa-IR');
const expiry = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'medium' });
const timeExpiry = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', dateStyle: 'medium', timeStyle: 'short' });
const couponCode = /^DMC-[A-F0-9]{32}$/;

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
            const input = button?.parentElement?.querySelector('[data-wallet-code]');
            if (!input || !couponCode.test(input.value)) return;
            const generation = this.generation;
            try {
                await navigator.clipboard.writeText(input.value);
                if (generation === this.generation) this.status.textContent = 'کد کپی شد.';
            } catch {
                if (generation === this.generation) {
                    input.focus();
                    input.select();
                }
            }
        };
        this.refreshButton?.addEventListener('click', this.onRefresh);
        this.list?.addEventListener('click', this.onCopy);
    }

    clear() {
        this.generation++;
        this.list.replaceChildren();
        this.status.textContent = '';
        if (this.refreshButton) this.refreshButton.disabled = false;
        if (this.restoreHint) this.restoreHint.hidden = true;
    }

    async beforeOpen() { await this.load(); }

    async beforeClose() { this.clear(); }

    async load() {
        this.clear();
        const generation = this.generation;
        const { player_id: owner, token } = this.service.identity ?? {};
        if (!this.service.connected || !token || !owner) {
            this.status.textContent = this.service.connected ? 'حساب خود را باز کنید تا تخفیف‌ها را ببینید.' : 'تخفیفی برای نمایش وجود ندارد.';
            if (this.restoreHint) this.restoreHint.hidden = !this.service.needsAccountRestore;
            return;
        }

        if (this.refreshButton) this.refreshButton.disabled = true;
        try {
            const coupons = await this.service.myCoupons();
            if (generation !== this.generation || token !== this.service.identity?.token
                || owner !== this.service.identity?.player_id) return;
            const active = coupons.filter(coupon => ['issued', 'reserved'].includes(coupon.status)
                && typeof coupon.code === 'string' && couponCode.test(coupon.code));
            this.status.textContent = active.length ? '' : 'هنوز کد تخفیفی نداری.';
            for (const coupon of active) this.list.append(this.createCard(coupon));
            if (typeof this.service.quietHours === 'function') {
                const offers = await this.service.quietHours().catch(() => null);
                if (generation !== this.generation || token !== this.service.identity?.token
                    || owner !== this.service.identity?.player_id) return;
                if (offers?.available && Array.isArray(offers.data)) {
                    for (const offer of offers.data) this.list.append(this.createOffer(offer, offers.eligible, generation, token, owner));
                    if (offers.data.length && !active.length) this.status.textContent = 'پیشنهادهای ساعات خلوت';
                }
            }
        } catch {
            if (generation === this.generation) this.status.textContent = 'کدها بارگیری نشدند. دوباره تلاش کنید.';
        } finally {
            if (generation === this.generation && this.refreshButton) this.refreshButton.disabled = false;
        }
    }

    createOffer(offer, eligible, generation, token, owner) {
        const card = document.createElement('li');
        card.className = 'wallet-card';
        const title = document.createElement('strong');
        title.textContent = 'ساعات خلوت · ' + digits.format(offer.percent) + '٪';
        const text = document.createElement('p');
        const end = Date.parse(offer.ends_at);
        text.textContent = 'شعبه ' + offer.branch + ' · حداقل خرید ' + digits.format(offer.minimum_minor)
            + ' · سقف ' + digits.format(offer.cap_minor) + ' ' + offer.currency
            + (Number.isFinite(end) ? ' · تا ' + timeExpiry.format(end) : '');
        const claim = document.createElement('button');
        claim.type = 'button';
        claim.className = 'shell-button shell-button--ghost';
        claim.disabled = !eligible;
        claim.textContent = eligible ? 'دریافت کد تخفیف' : 'نیازمند شماره تأییدشده ۴۸ ساعته و سهمیه روزانه';
        claim.addEventListener('click', async () => {
            if (generation !== this.generation || token !== this.service.identity?.token || owner !== this.service.identity?.player_id) return;
            claim.disabled = true;
            try {
                await this.service.claimQuietHours(offer.id);
                if (generation === this.generation && token === this.service.identity?.token && owner === this.service.identity?.player_id) await this.load();
            } catch {
                if (generation === this.generation && token === this.service.identity?.token && owner === this.service.identity?.player_id) {
                    this.status.textContent = 'دریافت پیشنهاد ممکن نبود؛ اعتبار و سهمیه را دوباره بررسی کنید.';
                    claim.disabled = false;
                }
            }
        });
        card.append(title, text, claim);
        return card;
    }

    createCard(coupon) {
        const card = document.createElement('li');
        card.className = 'wallet-card';
        card.dataset.walletState = coupon.status;
        const title = document.createElement('strong');
        title.textContent = (coupon.source === 'quiet_hours' ? 'تخفیف ساعات خلوت' : coupon.source === 'gift' ? 'هدیهٔ کافه' : 'جایزهٔ هفتگی')
            + ' · ' + digits.format(coupon.discount_percent) + '٪ تخفیف';
        const details = document.createElement('p');
        details.className = 'wallet-card__meta';
        const end = Date.parse(coupon.expires_at);
        if (Number.isFinite(end)) details.textContent = 'اعتبار تا ' + (coupon.source === 'quiet_hours' ? timeExpiry : expiry).format(end);
        if (coupon.source === 'quiet_hours') details.textContent += ' · فقط شعبه ' + (coupon.quiet_branch ?? 'نامشخص')
            + ' · حداقل ' + digits.format(coupon.min_order_minor) + ' · سقف ' + digits.format(coupon.max_discount_minor) + ' ' + coupon.currency;
        const code = document.createElement('input');
        code.readOnly = true;
        code.autocomplete = 'off';
        code.spellcheck = false;
        code.dir = 'ltr';
        code.dataset.walletCode = '';
        code.setAttribute('aria-label', 'کد تخفیف شما');
        code.value = coupon.code;
        code.addEventListener('focus', () => code.select());
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'shell-button shell-button--ghost';
        copy.dataset.walletCopy = '';
        copy.textContent = 'کپی';
        const row = document.createElement('div');
        row.className = 'wallet-card__code';
        row.append(code, copy);
        card.append(title, details, row);
        return card;
    }

    dispose() {
        this.clear();
        this.refreshButton?.removeEventListener('click', this.onRefresh);
        this.list?.removeEventListener('click', this.onCopy);
    }
}
