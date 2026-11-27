function fromPublicKey(value) {
    if (!/^[A-Za-z0-9_-]{87}$/.test(value ?? '')) return null;
    return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='), c => c.charCodeAt(0));
}

export async function gamePushRegistration() {
    if (!globalThis.isSecureContext || !globalThis.navigator?.serviceWorker || !globalThis.PushManager
        || !globalThis.document?.baseURI) return null;
    const worker = await navigator.serviceWorker.getRegistration(document.baseURI);
    return worker?.scope === new URL('./', document.baseURI).href && worker.active ? worker : null;
}

export async function clearGamePush(service, nextPlayerId = null) {
    if (!globalThis.navigator?.serviceWorker || service.identity?.player_id === nextPlayerId) return;
    try {
        const registration = await gamePushRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription) return;
        if (service.identity?.token) {
            await Promise.allSettled([
                service.request('/player/push/subscription', {
                    method: 'DELETE', body: { endpoint: subscription.endpoint }, authenticated: true,
                }),
                subscription.unsubscribe(),
            ]);
        } else if (nextPlayerId === null) {
            await subscription.unsubscribe();
        }
    } catch {}
}

export default class BrowserPushPanel {
    constructor(root, service) {
        this.root = root;
        this.service = service;
        this.status = root?.querySelector('[data-browser-push-status]');
        this.enable = root?.querySelector('[data-browser-push-enable]');
        this.disable = root?.querySelector('[data-browser-push-disable]');
        this.onEnable = () => { void this.activate(); };
        this.onDisable = () => { void this.deactivate(); };
        this.onRefresh = () => { if (!this.root?.closest('[hidden]')) void this.refresh(); };
        this.enable?.addEventListener('click', this.onEnable);
        this.disable?.addEventListener('click', this.onDisable);
        globalThis.navigator?.serviceWorker?.addEventListener('controllerchange', this.onRefresh);
        globalThis.addEventListener?.('online', this.onRefresh);
    }

    async refresh(message = null) {
        if (!this.status || this.busy) return;
        this.busy = true;
        this.enable.hidden = true;
        this.disable.hidden = true;
        try {
            this.registration = await gamePushRegistration();
            if (!globalThis.isSecureContext) {
                this.status.textContent = 'اعلان مرورگر پس از فعال شدن HTTPS در دسترس است.';
                return;
            }
            if (!globalThis.Notification || !globalThis.PushManager) {
                this.status.textContent = 'این مرورگر از اعلان بازی پشتیبانی نمی‌کند. در آیفون یا آیپد، دمیان را به صفحهٔ اصلی اضافه و از همان‌جا باز کن.';
                return;
            }
            const subscription = await this.registration?.pushManager.getSubscription();
            this.disable.hidden = !subscription;
            if (!this.service.connected) {
                this.status.textContent = message ?? 'سرویس اعلان بازی هنوز متصل نیست.';
                return;
            }
            if (!this.service.identity?.token) {
                this.status.textContent = message ?? 'برای فعال‌کردن اعلان، ابتدا وارد حساب آنلاین دمیان شو.';
                return;
            }
            if (Notification.permission === 'denied') {
                this.status.textContent = 'برای دریافت اعلان، مجوز دمیان را در تنظیمات مرورگر تغییر بده.';
                return;
            }
            const config = await this.service.request('/push/config');
            this.key = config.enabled ? fromPublicKey(config.public_key) : null;
            if (!this.key || !this.registration) {
                this.status.textContent = message ?? 'سرویس اعلان هنوز آماده نیست. کمی بعد تنظیمات را دوباره باز کن.';
                return;
            }
            this.enable.hidden = Boolean(subscription && this.hasCurrentKey(subscription));
            this.status.textContent = message ?? (this.enable.hidden
                ? 'اعلان دمیان در این مرورگر فعال است.' : 'برای دریافت خبرهای دمیان در این مرورگر، اعلان را فعال کن.');
        } catch {
            this.status.textContent = message ?? 'بررسی سرویس اعلان ناموفق بود. دوباره تلاش کن.';
        } finally {
            this.busy = false;
        }
    }

    hasCurrentKey(subscription) {
        const bytes = new Uint8Array(subscription.options?.applicationServerKey ?? []);
        return bytes.length === this.key?.length && this.key.every((byte, index) => byte === bytes[index]);
    }

    async activate() {
        if (this.busy || !this.registration || !this.key || !this.service.identity?.token) return;
        this.busy = true;
        this.enable.disabled = true;
        let subscription;
        let message;
        try {
            subscription = await this.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: this.key });
            const { endpoint, keys } = subscription.toJSON();
            await this.service.request('/player/push/subscription', {
                method: 'POST', body: { endpoint, keys }, authenticated: true,
            });
            message = 'اعلان دمیان در این مرورگر فعال شد.';
        } catch {
            try {
                subscription ??= await this.registration.pushManager.getSubscription();
                if (subscription) await subscription.unsubscribe();
            } catch {}
            message = 'فعال‌کردن اعلان کامل نشد. مجوز مرورگر را بررسی کن و دوباره تلاش کن.';
        } finally {
            this.busy = false;
            this.enable.disabled = false;
        }
        await this.refresh(message);
    }

    async deactivate() {
        if (this.busy) return;
        this.busy = true;
        this.disable.disabled = true;
        await clearGamePush(this.service);
        this.disable.disabled = false;
        this.busy = false;
        await this.refresh();
    }

    dispose() {
        this.enable?.removeEventListener('click', this.onEnable);
        this.disable?.removeEventListener('click', this.onDisable);
        globalThis.navigator?.serviceWorker?.removeEventListener('controllerchange', this.onRefresh);
        globalThis.removeEventListener?.('online', this.onRefresh);
    }
}
