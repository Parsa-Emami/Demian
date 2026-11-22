import DeviceQaSession from './DeviceQaSession.js';
import RuntimeSoakProfiler from './RuntimeSoakProfiler.js';
import TouchQaTracker from './TouchQaTracker.js';
import { evaluateDeviceQaTargets } from './DeviceQaTargets.js';
import { assignUiLayer, UI_LAYER } from '../ui/UiLayer.js';

export default class DeviceQaController {
    constructor(app) {
        this.app = app;
        this.session = new DeviceQaSession();
        this.soak = new RuntimeSoakProfiler();
        this.touchQa = new TouchQaTracker();
        this.onInput = event => {
            if (!event.isTrusted || event.pointerType !== 'touch' || !this.isPlaying()
                || this.panel.contains(event.target)) return;
            const receivedAt = performance.now();
            const timestamp = event.timeStamp > 1e12 ? event.timeStamp - performance.timeOrigin : event.timeStamp;
            // Only one low-cost sampled pointermove per 75 ms per active finger.
            // Cancel never contributes an input-to-render latency sample.
            if (this.touchQa.observe(event.type, event.pointerId, receivedAt)) {
                this.session.input(timestamp, receivedAt);
            }
        };
        this.onVisibility = () => {
            this.session.boundary(document.hidden ? 'background' : 'foreground');
            this.soak.boundary();
            this.touchQa.boundary();
        };
        this.onResize = () => {
            this.session.boundary(`viewport:${innerWidth}x${innerHeight}`);
            this.soak.boundary();
            this.touchQa.boundary();
        };
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
            <label>باتری شروع (درصد؛ دستی)<input data-qa-battery-before type="number" min="0" max="100" step="1" placeholder="اختیاری"></label>
            <label>باتری پایان (درصد؛ دستی)<input data-qa-battery-after type="number" min="0" max="100" step="1" placeholder="اختیاری"></label>
            <label>گرمای دستگاه پس از ۱۵ دقیقه (مشاهدهٔ دستی)<select data-qa-thermal>
                <option value="not-measured">اندازه‌گیری نشده</option>
                <option value="cool">خنک</option>
                <option value="warm">گرم</option>
                <option value="hot">خیلی گرم</option>
            </select></label>
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
            this.soak.start();
            this.touchQa.reset();
            this.sampleMemory();
            this.status.textContent = 'در حال ثبت؛ پنل را ببند و بازی کن.';
        };
        this.panel.querySelector('[data-qa-mark]').onclick = () => this.session.boundary(this.panel.querySelector('[data-qa-scenario]').value || 'manual');
        this.panel.querySelector('[data-qa-stop]').onclick = () => {
            this.sampleMemory();
            const report = this.session.stop();
            this.soak.stop();
            this.status.textContent = report ? `${report.frameIntervalMs.count} فاصلهٔ فریم ثبت شد؛ فایل را دانلود کن.` : 'ابتدا ثبت را شروع کن.';
        };
        this.panel.querySelector('[data-qa-download]').onclick = () => this.download();
        this.unsubscribe = this.app.eventBus.on('session:changed', change => {
            this.session.boundary(`session:${change.to}:${this.app.activeGameId}`);
            this.soak.boundary();
            this.touchQa.boundary();
        });
        this.unsubscribeSettings = this.app.settings.subscribe(() => {
            this.session.boundary('settings');
            this.soak.boundary();
            this.touchQa.boundary();
        });
        this.timer = window.setInterval(() => this.sampleMemory(), 5000);
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'])
            document.addEventListener(type, this.onInput, { capture: true, passive: true });
        document.addEventListener('visibilitychange', this.onVisibility);
        window.addEventListener('resize', this.onResize, { passive: true });
    }

    sampleMemory() {
        this.session.sampleMemory(performance.memory?.usedJSHeapSize);
        if (this.isPlaying()) this.soak.sampleMemory({
            game: this.app.activeGameId,
            jsHeapBytes: performance.memory?.usedJSHeapSize,
            spriteCacheBytes: this.app.characterVisuals?.memorySnapshot()?.cacheBytesEstimated,
            chunkLoaded: this.app.activeGame?.chunkManager?.stats()?.loaded,
        });
    }

    rendered(timestamp) {
        if (this.isPlaying()) {
            const fps = Number(this.app.root.dataset.renderFps);
            this.session.frame(timestamp, fps,
                `${this.app.activeGameId}:${this.app.root.dataset.renderQuality}`);
            this.soak.frame(timestamp, this.app.activeGameId, fps);
        }
    }

    frameWork(milliseconds) {
        if (this.isPlaying()) {
            this.session.sampleFrameWork(milliseconds);
            this.soak.work(milliseconds, this.app.activeGameId, Number(this.app.root.dataset.renderFps));
        }
    }

    download() {
        const report = this.session.report();
        if (!report) return;
        report.spriteCache = this.app.characterVisuals?.memorySnapshot() ?? null;
        report.touchSequence = this.touchQa.snapshot();
        report.performanceTargets = evaluateDeviceQaTargets(report);
        const battery = field => {
            const node=this.panel?.querySelector(field);
            if (!node?.value?.trim()) return null;
            const v=Number(node.value);
            return Number.isInteger(v) && v>=0 && v<=100 ? v : null;
        };
        report.manualObservations = {
            batteryStartPercent:battery('[data-qa-battery-before]'),
            batteryEndPercent:battery('[data-qa-battery-after]'),
            thermalSubjective:this.panel?.querySelector('[data-qa-thermal]')?.value ?? 'not-measured',
            measuredByHuman:false,
            note:'Manual, unverified observations; not an OS energy or temperature sensor.',
        };
        report.runtimeSoak = this.soak.report();
        report.openWorld = this.app.activeGame?.chunkManager?.stats() ?? null;
        report.staticCanvasCache = this.app.activeGame?.pixelRenderer?.sceneCache?.stats() ?? null;
        report.limitations.push('Sprite cache decoded pixel bytes are estimates for retained references, not native/GPU memory.');
        const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `demian-device-qa-${Date.now()}.json`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    dispose() {
        this.session.stop();
        this.soak.stop();
        this.unsubscribe?.();
        this.unsubscribeSettings?.();
        window.clearInterval(this.timer);
        for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'])
            document.removeEventListener(type, this.onInput, true);
        this.touchQa.boundary();
        document.removeEventListener('visibilitychange', this.onVisibility);
        window.removeEventListener('resize', this.onResize);
        this.panel?.remove();
    }
}
