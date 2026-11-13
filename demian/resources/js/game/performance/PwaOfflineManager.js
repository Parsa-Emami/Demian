/** Mobile-09: user-controlled PWA downloads, storage and reconnection.
 * Progressive enhancement only: failure never prevents ordinary gameplay.
 */
import { GAME_CATALOG } from '../catalog/GameCatalog.js';

const LABELS = new Map(GAME_CATALOG.filter(game => game.available)
    .map(game => [game.id, game.title]));
const mb = bytes => (bytes / 1048576).toFixed(1) + ' MB';

export function sendPwaMessage(worker, data, { onProgress = () => {}, timeoutMs = 30000 } = {}) {
    if (!worker || typeof MessageChannel !== 'function') {
        return Promise.reject(new Error('Service Worker در دسترس نیست.'));
    }
    return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        let timer;
        const cleanup = () => {
            clearTimeout(timer);
            channel.port1.close();
            channel.port2.close();
        };
        const arm = () => {
            clearTimeout(timer);
            timer = setTimeout(() => { cleanup(); reject(new Error('پاسخ مدیریت آفلاین به‌موقع نرسید.')); }, timeoutMs);
        };
        channel.port1.onmessage = event => {
            const row = event.data ?? {};
            if (row.type === 'PROGRESS') {
                arm();
                onProgress(row);
            } else if (row.type === 'DONE') {
                cleanup(); resolve(row);
            } else if (row.type === 'ERROR') {
                cleanup(); reject(new Error(String(row.message ?? 'خطای دانلود آفلاین')));
            }
        };
        arm();
        worker.postMessage(data, [channel.port2]);
    });
}

export default class PwaOfflineManager {
    constructor({ app, registration, documentRef = document, navigatorRef = navigator,
        windowRef = window } = {}) {
        this.app = app;
        this.registration = registration;
        this.document = documentRef;
        this.navigator = navigatorRef;
        this.window = windowRef;
        this.manifest = null;
        this.state = null;
        this.busy = false;
        this.deferredInstall = null;
        this.destroyed = false;
        this.onOnline = () => {
            if (this.app?.sessionState === 'menu' && this.app?.leaderboards?.pending) {
                void this.app.leaderboards.retry(); // idempotent, retryable, no blind score upload
            }
            void this.refresh();
        };
        this.onInstall = event => {
            event.preventDefault();
            this.deferredInstall = event;
            if (this.installButton) this.installButton.hidden = false;
        };
    }
    get worker() { return this.registration?.active; }
    async mount() {
        const screen = this.document.querySelector('[data-screen="game-selection"]');
        if (!screen) return this;
        this.panel = this.document.createElement('section');
        this.panel.className = 'demian-offline-manager';
        this.panel.setAttribute('aria-label', 'بازی‌های آفلاین');
        const title = this.document.createElement('h3');
        title.textContent = 'بازی بدون اینترنت';
        const hint = this.document.createElement('p');
        hint.textContent = 'فایل‌های هر بازی را با انتخاب خودت دریافت کن. رکورد جهانی فقط با تأیید سرور ثبت می‌شود.';
        this.status = this.document.createElement('p');
        this.status.setAttribute('role', 'status');
        this.status.setAttribute('aria-live', 'polite');
        this.status.textContent = 'در حال بررسی بسته‌های آفلاین…';
        this.rows = this.document.createElement('div');
        this.rows.className = 'demian-offline-manager__games';
        this.actions = new Map();
        for (const [id, name] of LABELS) {
            const row = this.document.createElement('div');
            row.className = 'demian-offline-manager__row';
            const label = this.document.createElement('span');
            label.textContent = name;
            const state = this.document.createElement('small');
            state.textContent = 'دریافت نشده';
            const download = this.button('دریافت برای آفلاین', () => this.download(id));
            const remove = this.button('حذف', () => this.remove(id));
            remove.hidden = true;
            row.append(label, state, download, remove);
            this.rows.append(row);
            this.actions.set(id, { state, download, remove });
        }
        const toolbar = this.document.createElement('div');
        toolbar.className = 'demian-offline-manager__toolbar';
        this.installButton = this.button('نصب روی دستگاه', () => this.install());
        this.refreshButton = this.button('بررسی فضا', () => this.refresh());
        toolbar.append(this.installButton, this.refreshButton);
        this.panel.append(title, hint, this.rows, toolbar, this.status);
        screen.append(this.panel);
        this.window.addEventListener('online', this.onOnline);
        this.window.addEventListener('beforeinstallprompt', this.onInstall);
        this.installed = this.window.matchMedia?.('(display-mode: standalone)')?.matches
            || this.navigator.standalone === true;
        this.installButton.hidden = Boolean(this.installed);
        try { await this.navigator.serviceWorker?.ready; } catch {}
        await this.refresh();
        return this;
    }
    button(label, action) {
        const button = this.document.createElement('button');
        button.type = 'button';
        button.className = 'shell-button shell-button--ghost';
        button.textContent = label;
        button.addEventListener('click', () => { void action(); });
        return button;
    }
    async refresh() {
        if (this.destroyed || this.busy) return;
        try {
            const state = await sendPwaMessage(this.worker, { type: 'DEMIAN_PACK_STATUS' });
            this.state = state;
            const estimate = await this.navigator.storage?.estimate?.().catch(() => null);
            const space = estimate?.usage != null && estimate?.quota != null
                ? ' · مصرف: ' + mb(estimate.usage) + ' از ' + mb(estimate.quota) : '';
            this.status.textContent = 'بسته‌ها آمادهٔ مدیریت هستند' + space +
                (this.navigator.onLine === false ? ' · اکنون آفلاین هستی.' : '');
            this.paint();
        } catch (error) {
            this.status.textContent = 'مدیریت حافظه در این مرورگر آماده نیست: ' + error.message;
        }
    }
    paint() {
        for (const [id, row] of this.actions) {
            const ready = this.state?.games?.[id] === true;
            row.state.textContent = ready ? 'آمادهٔ اجرای آفلاین' : 'دریافت نشده';
            row.download.hidden = ready;
            row.remove.hidden = !ready;
            row.download.disabled = this.busy || this.navigator.onLine === false;
            row.remove.disabled = this.busy;
        }
        this.refreshButton.disabled = this.busy;
    }
    async manifestForDownload() {
        if (this.manifest) return this.manifest;
        const resource = new URL('offline-packs.json', this.document.baseURI);
        const response = await this.window.fetch(resource.href, {
            cache: 'no-store', credentials: 'omit',
        });
        if (!response.ok) throw new Error('فهرست فایل‌های آفلاین در دسترس نیست.');
        const manifest = await response.json();
        if (manifest.schema !== 1 || !Array.isArray(manifest.games)) {
            throw new Error('فهرست بازی‌های آفلاین نامعتبر است.');
        }
        this.manifest = manifest;
        return manifest;
    }
    async download(id) {
        if (this.busy) return;
        this.busy = true; this.paint();
        try {
            if (this.navigator.onLine === false) throw new Error('برای دریافت اولیه باید آنلاین باشی.');
            const manifest = await this.manifestForDownload();
            const game = manifest.games.find(entry => entry.id === id);
            if (!game || game.totalBytes > manifest.maxPackBytes) throw new Error('بستهٔ این بازی معتبر نیست.');
            const need = (this.state?.coreReady ? game.bytes : game.totalBytes);
            const estimate = await this.navigator.storage?.estimate?.().catch(() => null);
            if (estimate?.quota != null && estimate?.usage != null &&
                estimate.quota - estimate.usage < need * 1.2) {
                throw new Error('فضای کافی برای دانلود امن این بازی وجود ندارد.');
            }
            // Explicit opt-in only; browsers may decline persistent storage.
            await this.navigator.storage?.persist?.().catch(() => false);
            const reply = await sendPwaMessage(this.worker,
                { type: 'DEMIAN_PACK_DOWNLOAD', id }, {
                    timeoutMs: 45000,
                    onProgress: step => {
                        this.status.textContent = 'دریافت ' + LABELS.get(id) + ': ' +
                            step.done + ' از ' + step.total + ' فایل';
                    },
                });
            this.state = reply;
            this.status.textContent = LABELS.get(id) + ' برای بازی آفلاین آماده شد.';
        } catch (error) {
            this.status.textContent = 'دانلود کامل نشد؛ بستهٔ ناقص قابل اجرا نیست: ' + error.message;
        } finally {
            this.busy = false; this.paint();
        }
    }
    async remove(id) {
        if (this.busy) return;
        this.busy = true; this.paint();
        try {
            this.state = await sendPwaMessage(this.worker, { type: 'DEMIAN_PACK_REMOVE', id });
            this.status.textContent = 'بستهٔ ' + LABELS.get(id) + ' حذف شد؛ حساب و رکوردها حفظ شدند.';
        } catch (error) {
            this.status.textContent = 'حذف بسته ناموفق بود: ' + error.message;
        } finally { this.busy = false; this.paint(); }
    }
    async install() {
        if (this.deferredInstall) {
            const event = this.deferredInstall;
            this.deferredInstall = null;
            await event.prompt();
            await event.userChoice;
            this.installButton.hidden = true;
        } else {
            this.status.textContent = 'برای نصب در iPhone/iPad از منوی Share گزینهٔ Add to Home Screen را بزن؛ در Android گزینهٔ Install app یا Add to Home screen را از منوی مرورگر انتخاب کن.';
        }
    }
    dispose() {
        this.destroyed = true;
        this.window.removeEventListener('online', this.onOnline);
        this.window.removeEventListener('beforeinstallprompt', this.onInstall);
        this.panel?.remove();
    }
}
