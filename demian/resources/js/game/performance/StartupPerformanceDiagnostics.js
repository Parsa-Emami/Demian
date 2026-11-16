/**
 * Opt-in, read-only on-device startup diagnostics. No URLs, tokens, account
 * identifiers, user agent, image names or untrusted errors are exported.
 * Data stays in memory and is downloaded only after an explicit tap.
 *
 * Web Performance API cannot isolate JS parse/eval or actual GPU paint.
 * Those fields are intentionally null; Chrome DevTools/CDP lab profiling
 * (see check_startup_diagnostics.mjs) measures JS compilation separately.
 */
const GAME_IDS = new Set([
    'open-world', 'dino-run', 'after-hours', 'cafe-rush', 'cafe-critters', 'coffee-crash',
]);
const MAX_GAME_RUNS = 24;
const MAX_SPRITE_SAMPLES = 96;
const MAX_LONG_TASKS = 120;
const MAX_RESOURCES = 2000;
const rounded = number => Number.isFinite(number) ? Math.round(Math.max(0, number) * 10) / 10 : null;
const difference = (end, start) => Number.isFinite(end) && Number.isFinite(start)
    ? rounded(end - start) : null;
const validGame = id => GAME_IDS.has(id);
const spriteVariant = variant => ['lite', 'runtime', 'detail', 'compact', 'mobile', 'desktop'].includes(variant)
    ? variant : 'unknown';

function resourceCategory(name, type) {
    let path = '';
    try { path = new URL(name, 'https://example.invalid/').pathname; } catch { return 'other'; }
    if (/\/assets\/characters\//.test(path)) return 'sprite';
    if (/\/assets\/environments\//.test(path)) return 'environment';
    if (/\.js$/.test(path) || type === 'script') return 'javascript';
    if (/\.css$/.test(path) || type === 'link') return 'stylesheet';
    if (/\.woff2?$/.test(path)) return 'font';
    if (/\.(?:png|webp|avif|jpe?g|svg)$/.test(path)) return 'image';
    if (/\.json$/.test(path)) return 'json';
    return 'other';
}
export function summarizeResources(entries = []) {
    const summary = {};
    const limit = Math.min(entries.length, MAX_RESOURCES);
    for (let index = 0; index < limit; index++) {
        const entry = entries[index];
        const category = resourceCategory(entry.name, entry.initiatorType);
        const row = summary[category] ??= {
            requests: 0, transferBytes: 0, encodedBodyBytes: 0,
            decodedBodyBytes: 0, durationTotalMs: 0, slowestMs: 0,
            transferSizeZero: 0,
        };
        row.requests++;
        const transfer = Math.max(0, Number(entry.transferSize) || 0);
        row.transferBytes += transfer;
        row.encodedBodyBytes += Math.max(0, Number(entry.encodedBodySize) || 0);
        row.decodedBodyBytes += Math.max(0, Number(entry.decodedBodySize) || 0);
        row.transferSizeZero += Number(transfer === 0);
        const duration = Math.max(0, Number(entry.duration) || 0);
        row.durationTotalMs += duration;
        row.slowestMs = Math.max(row.slowestMs, duration);
    }
    for (const row of Object.values(summary)) {
        row.durationTotalMs = rounded(row.durationTotalMs);
        row.slowestMs = rounded(row.slowestMs);
    }
    return { byCategory: summary, capturedResources: limit,
        truncated: entries.length > MAX_RESOURCES,
        note: 'Zero transferSize can mean HTTP cache, service worker, TAO restriction or unavailable timing; it does not prove a cache hit.' };
}
function collectNavigation(perf) {
    const nav = perf?.getEntriesByType?.('navigation')?.[0];
    if (!nav) return null;
    return {
        type: ['navigate', 'reload', 'back_forward', 'prerender'].includes(nav.type) ? nav.type : 'unknown',
        redirectMs: difference(nav.redirectEnd, nav.redirectStart),
        dnsMs: difference(nav.domainLookupEnd, nav.domainLookupStart),
        tcpMs: difference(nav.connectEnd, nav.connectStart),
        tlsMs: nav.secureConnectionStart > 0 ? difference(nav.connectEnd, nav.secureConnectionStart) : null,
        ttfbMs: difference(nav.responseStart, nav.requestStart),
        responseDownloadMs: difference(nav.responseEnd, nav.responseStart),
        domContentLoadedMs: rounded(nav.domContentLoadedEventEnd),
        loadEventMs: rounded(nav.loadEventEnd),
        transferBytes: Number.isFinite(nav.transferSize) ? nav.transferSize : null,
    };
}
function summarizeLongTasks(entries) {
    return {
        count: entries.length,
        totalBlockingAbove50Ms: rounded(entries.reduce((sum, e) => sum + Math.max(0, e.duration - 50), 0)),
        maximumTaskMs: rounded(entries.reduce((max, e) => Math.max(max, e.duration), 0)),
        truncated: entries.length >= MAX_LONG_TASKS,
    };
}
export default class StartupPerformanceDiagnostics {
    constructor({ eventBus, performanceRef = globalThis.performance,
        windowRef = globalThis.window, documentRef = globalThis.document,
        navigatorRef = globalThis.navigator, observerClass = globalThis.PerformanceObserver,
        now = () => performanceRef?.now?.() ?? Date.now() } = {}) {
        this.eventBus = eventBus;
        this.performanceRef = performanceRef;
        this.windowRef = windowRef;
        this.documentRef = documentRef;
        this.navigatorRef = navigatorRef;
        this.now = now;
        this.createdAtMs = this.now();
        this.menuBootMs = null;
        this.menuReadyAtMs = null;
        this.games = [];
        this.activeGame = null;
        this.imageSamples = [];
        this.longTasks = [];
        this.paint = {};
        this.longTaskTotal = 0;
        this.observers = [];
        this.subscriptions = [];
        this.firstRenderPending = null;
        this.disposed = false;
        try { performanceRef?.setResourceTimingBufferSize?.(MAX_RESOURCES); } catch {}
        this.bindEvents();
        if (typeof observerClass === 'function') this.observe(observerClass);
        if (documentRef?.body) this.mount();
    }

    observe(Observer) {
        for (const entryType of ['longtask', 'paint', 'largest-contentful-paint']) {
            try {
                const instance = new Observer(list => {
                    for (const entry of list.getEntries()) {
                        if (entryType === 'longtask') {
                            this.longTaskTotal++;
                            if (this.longTasks.length < MAX_LONG_TASKS) this.longTasks.push({
                                startTime: rounded(entry.startTime), duration: rounded(entry.duration),
                            });
                        } else if (entryType === 'paint') {
                            if (entry.name === 'first-paint' || entry.name === 'first-contentful-paint') {
                                this.paint[entry.name] = rounded(entry.startTime);
                            }
                        } else {
                            this.paint.lcpMs = rounded(entry.startTime);
                        }
                    }
                });
                instance.observe({ type: entryType, buffered: true });
                this.observers.push(instance);
            } catch { /* Browser does not implement this entry type. */ }
        }
    }

    bindEvents() {
        if (!this.eventBus?.on) return;
        this.subscriptions.push(this.eventBus.on('application:boot-timing', ({ durationMs }) => {
            this.menuBootMs = rounded(durationMs);
            this.menuReadyAtMs = rounded(this.now());
            this.updateStatus();
        }));
        this.subscriptions.push(this.eventBus.on('game:loading', ({ gameId }) => {
            if (!validGame(gameId)) return;
            const start = this.now();
            const record = { game: gameId, atMs: rounded(start), moduleMs: null,
                assetsMs: null, sceneMs: null, sessionMs: null,
                totalMs: null, firstRenderAfterSessionMs: null, firstRenderAtMs: null,
                status: 'loading' };
            if (this.games.length >= MAX_GAME_RUNS) this.games.shift();
            this.games.push(record);
            this.activeGame = { record, start, previous: start, stage: 0 };
        }));
        this.subscriptions.push(this.eventBus.on('game:loading-step', ({ gameId, progress }) => {
            const attempt = this.activeGame;
            if (!attempt || attempt.record.game !== gameId) return;
            const stage = ({ 25: 1, 50: 2, 75: 3, 100: 4 })[progress];
            if (!stage || stage <= attempt.stage || stage > attempt.stage + 1) return;
            const key = ['moduleMs', 'assetsMs', 'sceneMs', 'sessionMs'][stage - 1];
            attempt.record[key] = difference(this.now(), attempt.previous);
            attempt.previous = this.now();
            attempt.stage = stage;
        }));
        this.subscriptions.push(this.eventBus.on('game:session-started', ({ gameId }) => {
            const attempt = this.activeGame;
            if (attempt?.record.game === gameId) {
                this.firstRenderPending = { record: attempt.record, at: this.now() };
            }
        }));
        this.subscriptions.push(this.eventBus.on('game:load-timing', ({ gameId, durationMs }) => {
            const attempt = this.activeGame;
            if (attempt?.record.game !== gameId) return;
            attempt.record.totalMs = rounded(durationMs);
            attempt.record.status = 'playing';
            this.activeGame = null;
            this.updateStatus();
        }));
        this.subscriptions.push(this.eventBus.on('game:load-failed', ({ gameId }) => {
            const attempt = this.activeGame;
            if (attempt?.record.game === gameId) {
                attempt.record.status = 'failed';
                this.activeGame = null;
                this.firstRenderPending = null;
                this.updateStatus();
            }
        }));
        this.subscriptions.push(this.eventBus.on('character:image-timing', row => {
            if (this.imageSamples.length >= MAX_SPRITE_SAMPLES) return;
            this.imageSamples.push({
                variant: spriteVariant(row?.variant),
                background: Boolean(row?.background),
                loadingMs: rounded(row?.loadingMs),
                decodeMs: rounded(row?.decodeMs),
                width: Math.max(0, Math.min(16384, Math.round(Number(row?.width) || 0))),
                height: Math.max(0, Math.min(16384, Math.round(Number(row?.height) || 0))),
            });
        }));
    }

    rendered(timestamp) {
        const pending = this.firstRenderPending;
        if (!pending || !Number.isFinite(timestamp) || timestamp < pending.at) return;
        pending.record.firstRenderAfterSessionMs = difference(timestamp, pending.at);
        pending.record.firstRenderAtMs = rounded(timestamp);
        this.firstRenderPending = null;
        this.updateStatus();
    }

    report() {
        const perf = this.performanceRef;
        const n = this.navigatorRef;
        const w = this.windowRef;
        let resources = [];
        try { resources = perf?.getEntriesByType?.('resource') ?? []; } catch {}
        let serviceWorkerControlled = null;
        try { serviceWorkerControlled = Boolean(n?.serviceWorker?.controller); } catch {}
        let isStandalone = false;
        try { isStandalone = Boolean(w?.matchMedia?.('(display-mode: standalone)')?.matches || n?.standalone); } catch {}
        const connection = n?.connection ?? n?.mozConnection ?? n?.webkitConnection;
        return {
            schemaVersion: 1,
            evidenceType: 'opt-in-browser-diagnostic',
            physicalPhoneVerified: false,
            capturedOn: 'user device, unverified environment',
            privacy: 'local-only; no raw URLs, user-agent, account data or network upload',
            page: { navigation: collectNavigation(perf),
                paint: { firstPaintMs: this.paint['first-paint'] ?? null,
                    firstContentfulPaintMs: this.paint['first-contentful-paint'] ?? null,
                    largestContentfulPaintMs: this.paint.lcpMs ?? null },
                menuBootMs: this.menuBootMs, menuReadyAtMs: this.menuReadyAtMs,
                javascriptParseEvaluateMs: null,
                note: 'Pure Web Performance API cannot isolate JS parse/eval. Use Chromium CDP lab metrics for JS compile and script execution.' },
            network: summarizeResources(resources),
            longTasks: { ...summarizeLongTasks(this.longTasks),
                count: this.longTaskTotal },
            gameStarts: this.games.map(row => ({ ...row })),
            characterImages: this.imageSamples.map(row => ({ ...row })),
            environment: {
                viewport: [w?.innerWidth ?? null, w?.innerHeight ?? null],
                dpr: rounded(w?.devicePixelRatio),
                standalonePwa: isStandalone,
                serviceWorkerControlled,
                onLine: n?.onLine ?? null,
                effectiveType: ['slow-2g', '2g', '3g', '4g'].includes(connection?.effectiveType)
                    ? connection.effectiveType : null,
                saveData: Boolean(connection?.saveData),
            },
            limitations: [
                'The environment is self-reported and has not been independently certified as a physical phone.',
                'First render means JavaScript submitted a game frame; actual GPU scanout/first visible frame cannot be measured here.',
                'A character loading time is image.onload latency; decodeMs measures image.decode() only when supported.',
                'Resource transferSize zero does not reliably distinguish memory cache, service worker, or cross-origin timing limits.',
                'Cold or warm cache status must be documented in the test scenario; it cannot be proven from browser APIs.',
                'No JS parse/eval timing on Safari/Firefox; LCP and long tasks may also be unsupported.',
            ],
        };
    }

    mount() {
        const panel = this.documentRef.createElement('details');
        panel.dataset.startupDiagnostics = 'true';
        panel.setAttribute('dir', 'rtl');
        panel.style.cssText = 'position:fixed;z-index:2147483645;bottom:12px;left:12px;max-width:min(340px,90vw);border-radius:10px;background:#18251f;color:#fff;padding:8px 12px;font:14px sans-serif;box-shadow:0 5px 20px #0007';
        const title = this.documentRef.createElement('summary');
        title.textContent = 'Performance QA';
        const help = this.documentRef.createElement('p');
        help.textContent = 'ابتدا سایت را با کش پاک‌شده (Cold) و سپس با بازخوانی عادی (Warm) تست کنید. برای تست نسخهٔ نصب‌شده، برنامه را از صفحهٔ اصلی گوشی باز کنید. این گزارش فقط روی دستگاه شما ساخته می‌شود.';
        const status = this.documentRef.createElement('output');
        status.dataset.startupStatus = 'true';
        status.setAttribute('aria-live', 'polite');
        const button = this.documentRef.createElement('button');
        button.dataset.startupDownload = 'true';
        button.type = 'button';
        button.textContent = 'دانلود گزارش JSON';
        button.style.cssText = 'display:block;min-height:44px;padding:8px 12px;margin-top:12px;border:1px solid #fff;border-radius:8px;background:transparent;color:#fff';
        button.addEventListener('click', () => this.download());
        panel.append(title, help, status, button);
        this.documentRef.body.append(panel);
        this.panel = panel;
        this.statusElement = status;
        this.updateStatus();
    }

    updateStatus() {
        if (!this.statusElement) return;
        const last = this.games.at(-1);
        this.statusElement.textContent = 'منو: ' + (this.menuReadyAtMs ?? '—') + 'ms؛ بازی: ' +
            (last?.game ?? '—') + ' / ' + (last?.totalMs ?? '—') + 'ms. اندازه‌گیری JS Parse روی دستگاه پشتیبانی نمی‌شود.';
    }

    download() {
        if (!this.documentRef?.createElement || !this.windowRef?.URL?.createObjectURL) return;
        const url = this.windowRef.URL.createObjectURL(new Blob([JSON.stringify(this.report(), null, 2)], {
            type: 'application/json',
        }));
        const anchor = this.documentRef.createElement('a');
        anchor.href = url;
        anchor.download = 'demian-startup-performance-' + Date.now() + '.json';
        anchor.click();
        this.windowRef.setTimeout(() => this.windowRef.URL.revokeObjectURL(url), 1000);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const unsubscribe of this.subscriptions) unsubscribe?.();
        for (const observer of this.observers) observer.disconnect?.();
        this.panel?.remove();
    }
}
