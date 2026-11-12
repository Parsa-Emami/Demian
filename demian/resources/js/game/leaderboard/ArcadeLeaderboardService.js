import rules from '../../../game/runner-rules.json' with { type: 'json' };

const PROFILE_KEY = 'demian.arcade.profile.v1';
const LOCAL_KEY = `demian.arcade.scores.${rules.version}`;
const safeRead = (storage, key, fallback) => { try { return JSON.parse(storage?.getItem(key)) ?? fallback; } catch { return fallback; } };
const safeWrite = (storage, key, value) => { try { storage?.setItem(key, JSON.stringify(value)); } catch {} };

export default class ArcadeLeaderboardService {
    constructor({ baseUrl = globalThis.document?.querySelector('meta[name="demian-arcade-api"]')?.content ?? '',
        storage, fetcher = globalThis.fetch?.bind(globalThis), timeout = 8000 } = {}) {
        if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
        this.storage = storage; this.fetcher = fetcher; this.timeout = timeout;
        this.baseUrl = String(baseUrl).trim().replace(/\/$/, '');
        this.profile = safeRead(storage, PROFILE_KEY, { display_name: 'بازیکن کافه' });
        this.identityKey = `demian.arcade.identity.v1:${this.baseUrl}`;
        this.identity = safeRead(storage, this.identityKey, null);
        this.pending = null;
    }
    get connected() { return Boolean(this.baseUrl); }
    get displayName() { return this.profile.display_name; }
    async request(path, { method = 'GET', body, authenticated = false } = {}) {
        if (!this.connected || !this.fetcher) throw new Error('لیدربورد آنلاین پیکربندی نشده است.');
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await this.fetcher(`${this.baseUrl}${path}`, { method, credentials: 'omit',
                headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
                    ...(authenticated ? { Authorization: `Bearer ${this.identity?.token ?? ''}` } : {}) },
                ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal });
            if (!response.ok) { const error = new Error(`ارتباط با لیدربورد ناموفق بود (${response.status}).`); error.status = response.status; throw error; }
            return await response.json();
        } finally { clearTimeout(timer); }
    }
    async ensureIdentity() {
        if (this.identity?.token) return this.identity;
        this.identity = await this.request('/players', { method: 'POST', body: { display_name: this.displayName } });
        safeWrite(this.storage, this.identityKey, this.identity); return this.identity;
    }
    async rename(name) {
        const value = String(name).trim();
        if (!/^[\p{L}\p{N} _\-\u200c]{2,32}$/u.test(value)) throw new Error('نام باید ۲ تا ۳۲ حرف، عدد یا فاصله داشته باشد.');
        if (this.connected) { await this.ensureIdentity(); await this.request('/player', { method: 'PATCH', authenticated: true, body: { display_name: value } }); }
        this.profile = { display_name: value }; safeWrite(this.storage, PROFILE_KEY, this.profile);
    }
    async start({ width, character, seed } = {}) {
        if (!this.connected || seed !== undefined) return { mode: 'practice', seed: seed ?? Date.now(), track_width: width };
        try {
            await this.ensureIdentity();
            const result = await this.request('/runs', { method: 'POST', authenticated: true,
                body: { request_id: crypto.randomUUID(), game_id: 'dino-run', character_slug: character, track_width: width, rules_version: rules.version } });
            if (result.rules_version !== rules.version) throw new Error('نسخهٔ قوانین تغییر کرده است.');
            return { ...result, mode: 'ranked' };
        } catch (error) {
            if (error.status === 401) { this.identity = null; safeWrite(this.storage, this.identityKey, null); }
            return { mode: 'practice', seed: Date.now(), track_width: width, reason: 'ارتباط آنلاین برقرار نشد؛ این دور روی دستگاه ثبت می‌شود.' };
        }
    }
    localScores() {
        const rows = safeRead(this.storage, LOCAL_KEY, []);
        return Array.isArray(rows) ? rows.filter(row => Number.isFinite(row.score) && typeof row.display_name === 'string' && typeof row.achieved_at === 'string') : [];
    }
    recordLocal(model, character) {
        const row = { score: model.score, character_slug: character, display_name: this.displayName, achieved_at: new Date().toISOString() };
        const rows = [...this.localScores(), row].sort((a, b) => b.score - a.score || a.achieved_at.localeCompare(b.achieved_at)).slice(0, 20);
        safeWrite(this.storage, LOCAL_KEY, rows); return row;
    }
    async finish(run, model, replay, character) {
        this.recordLocal(model, character);
        if (run?.mode !== 'ranked' || !replay?.valid) return { status: 'practice', score: model.score };
        this.pending = { id: run.run_id, body: replay.payload() }; return this.retry();
    }
    async retry() {
        if (!this.pending) return { status: 'practice' };
        const pending = this.pending;
        try {
            const result = await this.request(`/runs/${encodeURIComponent(pending.id)}/complete`, { method: 'POST', authenticated: true, body: pending.body });
            if (this.pending === pending) this.pending = null; return result;
        } catch (error) {
            const retryable = !error.status || error.status >= 500 || error.status === 429;
            if (!retryable && this.pending === pending) this.pending = null;
            return { status: retryable ? 'pending' : 'rejected', retryable, message: error.message };
        }
    }
    async list(period = 'weekly') {
        if (this.connected && period !== 'device') return { ...await this.request(`/leaderboards/dino-run?period=${encodeURIComponent(period)}&limit=20`), mode: 'online' };
        return { mode: 'device', data: this.localScores().map((row, index) => ({ ...row, rank: index + 1 })) };
    }
}
