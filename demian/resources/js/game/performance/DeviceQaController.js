import DeviceQaSession from './DeviceQaSession.js';
import { assignUiLayer, UI_LAYER } from '../ui/UiLayer.js';

export default class DeviceQaController {
    constructor(app) {
        this.app = app;
        this.session = new DeviceQaSession();
        this.onInput = event => {
            if (!event.isTrusted || event.pointerType !== 'touch' || !this.isPlaying()
                || this.panel.contains(event.target)) return;
            const receivedAt = performance.now();
            const timestamp = event.timeStamp > 1e12 ? event.timeStamp - performance.timeOrigin : event.timeStamp;
            this.session.input(timestamp, receivedAt);
        };
        this.onVisibility = () => this.session.boundary(document.hidden ? 'background' : 'foreground');
        this.onResize = () => this.session.boundary(`viewport:${innerWidth}x${innerHeight}`);
    }

    isPlaying() {
        return !document.hidden && this.app.sessionState === 'playing';
    }

    mount() {
        this.panel = assignUiLayer(document.createElement('details'), UI_LAYER.SYSTEM_OVERLAY);
        this.panel.className = 'device-qa';
        this.panel.dataset.deviceQa = '';
        this.panel.dir = 'rtl';
        this.panel.innerHTML = `<summary>QA</summary><div class="device-qa__body">
            <label>مدل دستگاه / نسخه سیستم‌عامل<input data-qa-device maxlength="100"></label>
            <label>مرحله آزمایش<input data-qa-scenario maxlength="100" placeholder="چرخش، تعویض کاراکتر…"></label>
            <button type="button" data-qa-start>شروع ثبت</button>
            <button type="button" data-qa-mark>ثبت مرحله</button>
            <button type="button" data-qa-stop>توقف ثبت</button>
            <button type="button" data-qa-download>دانلود JSON</button>
            <output data-qa-status aria-live="polite">آماده؛ اندازه‌گیری دستگاه واقعی هنوز تأیید نشده است.</output>
        </div>`;
        document.body.append(this.panel);
        this.status = this.panel.querySelector('[data-qa-status]');
        this.panel.querySelector('[data-qa-start]').onclick = () => {
            this.session.start({ deviceLabel: this.panel.querySelector('[data-qa-device]').value,
                userAgent: navigator.userAgent, viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
                runtimeVersion: this.app.root.dataset.runtimeVersion, startedAt: new Date().toISOString(),
                settings: this.app.settings.snapshot() });
            this.sampleMemory();
            this.status.textContent = 'در حال ثبت؛ پنل را ببند و بازی کن.';
        };
        this.panel.querySelector('[data-qa-mark]').onclick = () => this.session.boundary(this.panel.querySelector('[data-qa-scenario]').value || 'manual');
        this.panel.querySelector('[data-qa-stop]').onclick = () => {
            this.sampleMemory();
            const report = this.session.stop();
            this.status.textContent = report ? `${report.frameIntervalMs.count} فاصلهٔ فریم ثبت شد؛ فایل را دانلود کن.` : 'ابتدا ثبت را شروع کن.';
        };
        this.panel.querySelector('[data-qa-download]').onclick = () => this.download();
        this.unsubscribe = this.app.eventBus.on('session:changed', change => this.session.boundary(`session:${change.to}:${this.app.activeGameId}`));
        this.unsubscribeSettings = this.app.settings.subscribe(() => this.session.boundary('settings'));
        this.timer = window.setInterval(() => this.sampleMemory(), 5000);
        for (const type of ['pointerdown', 'pointermove', 'pointerup']) document.addEventListener(type, this.onInput, { capture: true, passive: true });
        document.addEventListener('visibilitychange', this.onVisibility);
        window.addEventListener('resize', this.onResize, { passive: true });
    }

    sampleMemory() {
        this.session.sampleMemory(performance.memory?.usedJSHeapSize);
    }

    rendered(timestamp) {
        if (this.isPlaying()) this.session.frame(timestamp, Number(this.app.root.dataset.renderFps),
            `${this.app.activeGameId}:${this.app.root.dataset.renderQuality}`);
    }

    download() {
        const report = this.session.report();
        if (!report) return;
        const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `demian-device-qa-${Date.now()}.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    dispose() {
        this.session.stop();
        this.unsubscribe?.();
        this.unsubscribeSettings?.();
        window.clearInterval(this.timer);
        for (const type of ['pointerdown', 'pointermove', 'pointerup']) document.removeEventListener(type, this.onInput, true);
        document.removeEventListener('visibilitychange', this.onVisibility);
        window.removeEventListener('resize', this.onResize);
        this.panel?.remove();
    }
}
