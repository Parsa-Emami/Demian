/**
 * Step 33: explicitly opted-in, low-volume, anonymous performance events.
 * No persistent IDs, full URLs, device fingerprints, tokens, IP, raw error
 * messages, stack traces or player input leave the browser.
 */
const ALLOWED_GAMES = new Set([
    'open-world', 'dino-run', 'after-hours', 'cafe-rush', 'cafe-critters', 'coffee-crash',
]);
const KINDS = new Set(['menu_ready', 'game_load', 'game_error', 'fps']);

export default class AnonymousGameTelemetry {
    constructor({
        enabled = globalThis.document?.querySelector('meta[name="demian-ops-client"]')?.content === 'on',
        baseUrl = globalThis.document?.querySelector('meta[name="demian-arcade-api"]')?.content ?? '',
        fetcher = globalThis.fetch?.bind(globalThis),
        clock = () => globalThis.performance?.now?.() ?? Date.now(),
    } = {}) {
        this.baseUrl = String(baseUrl).trim().replace(/\/$/, '');
        let origin;
        try { origin = new URL(this.baseUrl, globalThis.location?.href ?? 'https://demiancafe.ir/'); }
        catch { /* Invalid configuration is never a reason to break gameplay. */ }
        this.enabled = enabled === true && !!fetcher && !!origin &&
            origin.protocol === 'https:' && origin.pathname.endsWith('/api/v1/arcade');
        this.fetcher = fetcher;
        this.clock = clock;
        this.sent = 0;
        this.lastSent = new Map();
        this.frameStart = null;
        this.frames = 0;
    }

    emit(kind, { game = null, durationMs = null, fps = null } = {}) {
        if (!this.enabled || !KINDS.has(kind) || this.sent >= 40) return false;
        if (game !== null && !ALLOWED_GAMES.has(game)) return false;
        if ((kind === 'game_load' || kind === 'game_error') && !game) return false;
        const now = this.clock();
        const key = kind + ':' + (game ?? 'menu');
        if (now - (this.lastSent.get(key) ?? -Infinity) < 15000) return false;

        const payload = { kind };
        if (game) payload.game = game;
        if (Number.isFinite(durationMs)) payload.duration_ms = Math.max(0,
            Math.min(60000, Math.round(durationMs)));
        if (Number.isFinite(fps)) payload.fps = Math.max(0, Math.min(120, Math.round(fps)));
        this.sent++;
        this.lastSent.set(key, now);
        // Do not await, block menu, retry, queue offline or store the payload.
        try {
            Promise.resolve(this.fetcher(this.baseUrl + '/telemetry', {
                method: 'POST', mode: 'cors', credentials: 'omit',
                cache: 'no-store', referrerPolicy: 'no-referrer', keepalive: true,
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify(payload),
            })).catch(() => undefined);
        } catch { /* no-op */ }
        return true;
    }

    frame(timestamp, gameId, playing = false) {
        if (!this.enabled || !playing || !ALLOWED_GAMES.has(gameId)
            || globalThis.document?.visibilityState === 'hidden'
            || !Number.isFinite(timestamp)) {
            this.frameStart = null;
            this.frames = 0;
            return;
        }
        if (this.frameStart === null || timestamp < this.frameStart) {
            this.frameStart = timestamp;
            this.frames = 0;
            return;
        }
        this.frames++;
        const elapsed = timestamp - this.frameStart;
        if (elapsed < 10000) return;
        const fps = Math.min(120, (this.frames * 1000) / Math.max(elapsed, 1));
        this.emit('fps', { game: gameId, fps });
        this.frameStart = timestamp;
        this.frames = 0;
    }
}
