import rules from '../../../game/runner-rules.json' with { type: 'json' };

const PROFILE_KEY = 'demian.arcade.profile.v1';
const LOCAL_KEY = `demian.arcade.scores.${rules.version}`;
const safeRead = (storage, key, fallback) => { try { return JSON.parse(storage?.getItem(key)) ?? fallback; } catch { return fallback; } };
const safeWrite = (storage, key, value) => { try { storage?.setItem(key, JSON.stringify(value)); } catch {} };

export default class ArcadeLeaderboardService {
    constructor({ baseUrl = globalThis.document?.querySelector('meta[name="demian-arcade-api"]')?.content ?? '',
        storage, identityStorage, fetcher = globalThis.fetch?.bind(globalThis), timeout = 8000 } = {}) {
        const injectedStorage = storage !== undefined;
        if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
        // Ranked replay evidence is durable, but bearer credentials are not
        // persisted in localStorage on real devices. Tests can inject a store.
        if (identityStorage === undefined) {
            if (injectedStorage) identityStorage = storage;
            else { try { identityStorage = globalThis.sessionStorage; } catch { identityStorage = null; } }
        }
        this.storage = storage;
        this.identityStorage = identityStorage;
        this.fetcher = fetcher; this.timeout = timeout;
        this.retryPromise = null;
        this.baseUrl = String(baseUrl).trim().replace(/\/$/, '');
        // Never transmit account bearer capabilities over cleartext network.
        // HTTP is permitted only for loopback development.
        if (this.baseUrl) {
            let endpoint;
            try { endpoint = new URL(this.baseUrl, globalThis.location?.href ?? 'https://localhost/'); } catch {}
            if (!endpoint || (endpoint.protocol !== 'https:' &&
                !(endpoint.protocol === 'http:' &&
                    ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)))) {
                this.baseUrl = '';
            }
        }
        this.profile = safeRead(storage, PROFILE_KEY, { display_name: 'بازیکن کافه' });
        this.identityKey = `demian.arcade.identity.v1:${this.baseUrl}`;
        this.accountMarkerKey = `demian.arcade.account-exists.v1:${this.baseUrl}`;
        this.accountKnown = safeRead(storage, this.accountMarkerKey, false) === true;
        this.identity = safeRead(identityStorage, this.identityKey, null);
        // Migrate a legacy saved bearer once, then erase it from persistent
        // storage. Account identity is still server-verified on every request.
        if (!injectedStorage) {
            const legacy = safeRead(storage, this.identityKey, null);
            if (!this.identity?.token && legacy?.token) {
                this.identity = legacy;
                safeWrite(identityStorage, this.identityKey, legacy);
            }
            try { storage?.removeItem(this.identityKey); } catch {}
        }
        // URL fragments stay client-side. Strip them immediately, but never
        // redeem a bearer recovery capability without an explicit UI action.
        const fragment = globalThis.location?.hash ?? '';
        const match = /^#demian-recover=([A-Za-z0-9]{64})$/.exec(fragment);
        this.recoveryOffer = match?.[1] ?? null;
        if (match && globalThis.history?.replaceState) {
            globalThis.history.replaceState(globalThis.history.state, '',
                globalThis.location.pathname + globalThis.location.search);
        }
        if (this.identity?.player_id) {
            this.accountKnown = true;
            safeWrite(storage, this.accountMarkerKey, true);
        }
        this.pendingKey = `demian.arcade.pending.v1:${this.baseUrl}`;
        this.rejectedKey = `demian.arcade.rejected.v1:${this.baseUrl}`;
        const history = safeRead(storage, this.rejectedKey, []);
        // Keep a bounded audit trail without allowing a rejected run to block
        // every future ranked attempt. This is local evidence, not a score.
        this.rejected = Array.isArray(history) ? history.slice(-10) : [];
        const saved = safeRead(storage, this.pendingKey, null);
        // Replay evidence is never a client score; restore only for the same account.
        this.pending = saved
            && typeof saved.id === 'string' && /^[0-9a-f-]{36}$/i.test(saved.id)
            && Number.isInteger(saved.body?.ticks)
            && (saved.kind === 'turn'
                ? Array.isArray(saved.body?.actions) && saved.body.actions.length >= 12
                    && saved.body.actions.length <= 240
                : Array.isArray(saved.body?.transitions) && saved.body.transitions.length > 0
                    && saved.body.transitions.length <= 12000)
            ? saved : null;
    }
    savePending(pending) {
        this.pending = pending;
        try {
            if (!this.storage) throw new Error('storage unavailable');
            const serialized = JSON.stringify(pending);
            this.storage.setItem(this.pendingKey, serialized);
            this.pendingIsDurable = this.storage.getItem(this.pendingKey) === serialized;
        } catch {
            this.pendingIsDurable = false;
        }
        return this.pendingIsDurable;
    }
    archiveRejected(pending, status) {
        const record = { ...pending, rejected_at: new Date().toISOString(), http_status: status };
        const next = [...this.rejected, record].slice(-10);
        // Write the archive before removing the live queue entry. On quota
        // failure preserve the original evidence (fail closed).
        try {
            const serialized = JSON.stringify(next);
            this.storage?.setItem(this.rejectedKey, serialized);
            if (this.storage?.getItem(this.rejectedKey) !== serialized) return false;
        } catch { return false; }
        this.rejected = next;
        if (this.pending === pending) this.savePending(null);
        return true;
    }
    get connected() { return Boolean(this.baseUrl); }
    get hasRecoveryRequired() {
        return Boolean(this.pending && (!this.identity?.token || this.pending.player_id !== this.identity.player_id));
    }
    get needsAccountRestore() {
        return this.hasRecoveryRequired || (this.accountKnown && !this.identity?.token);
    }
    get displayName() { return this.profile.display_name; }
    async request(path, { method = 'GET', body, authenticated = false } = {}) {
        if (!this.connected || !this.fetcher) throw new Error('لیدربورد آنلاین پیکربندی نشده است.');
        const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), this.timeout);
        try {
            const response = await this.fetcher(`${this.baseUrl}${path}`, { method, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
                headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}),
                    ...(authenticated ? { Authorization: `Bearer ${this.identity?.token ?? ''}` } : {}) },
                ...(body ? { body: JSON.stringify(body) } : {}), signal: controller.signal });
            if (!response.ok) { const error = new Error(`ارتباط با لیدربورد ناموفق بود (${response.status}).`); error.status = response.status; throw error; }
            return await response.json();
        } finally { clearTimeout(timer); }
    }
    async ensureIdentity() {
        if (this.identity?.token) return this.identity;
        if (this.pending || this.accountKnown) throw new Error('برای حفظ رکوردهای قبلی، حساب اصلی را بازیابی کن.');
        this.identity = await this.request('/players', { method: 'POST', body: { display_name: this.displayName } });
        safeWrite(this.identityStorage, this.identityKey, this.identity);
        this.accountKnown = true;
        safeWrite(this.storage, this.accountMarkerKey, true);
        return this.identity;
    }
    async issueRecoveryLink(pageUrl = globalThis.location?.href) {
        if (!pageUrl) throw new Error('لینک صفحه در دسترس نیست.');
        const url = new URL(pageUrl);
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
            throw new Error('بازیابی حساب فقط در اتصال امن در دسترس است.');
        }
        await this.ensureIdentity();
        const result = await this.request('/player/recovery-link', {
            method: 'POST', authenticated: true,
        });
        if (!/^[A-Za-z0-9]{64}$/.test(result.recovery_code ?? '')) {
            throw new Error('پاسخ بازیابی سرور نامعتبر بود.');
        }
        this.recoveryExpiresAt = typeof result.recovery_expires_at === 'string'
            ? result.recovery_expires_at : null;
        url.hash = `demian-recover=${result.recovery_code}`;
        return url.toString();
    }
    async issueBackupCode() {
        await this.ensureIdentity();
        const result = await this.request('/player/backup-code', {
            method: 'POST', authenticated: true,
        });
        if (!/^[A-Za-z0-9]{64}$/.test(result.backup_code ?? '') ||
            !Number.isFinite(Date.parse(result.backup_expires_at ?? ''))) {
            throw new Error('کد پشتیبان یا تاریخ انقضای سرور نامعتبر است.');
        }
        // Never write backup material to localStorage/sessionStorage.
        this.backupExpiresAt = result.backup_expires_at;
        return result.backup_code;
    }
    async recoverAccount(code) {
        const value = String(code ?? '').trim();
        if (!/^[A-Za-z0-9]{64}$/.test(value)) {
            throw new Error('کد بازیابی ۶۴ نویسهٔ معتبر لازم دارد.');
        }
        if (this.pending && !this.hasRecoveryRequired) {
            await this.retry();
            if (this.pending) throw new Error('ابتدا ارسال رکورد قبلی را تکمیل کن؛ رکورد تأییدنشده نباید حذف شود.');
        }
        const response = await this.request('/players/recover', {
            method: 'POST', body: { recovery_code: value },
        });
        if (typeof response.token !== 'string' || response.token.length !== 64
            || typeof response.player_id !== 'string'
            || typeof response.display_name !== 'string') {
            throw new Error('پاسخ بازیابی سرور نامعتبر بود.');
        }
        // Never put the recovery code or the complete raw response in storage.
        this.identity = { token: response.token, player_id: response.player_id,
            token_expires_at: response.token_expires_at };
        this.profile = { display_name: response.display_name };
        // Pending evidence remains stored even if the recovery capability
        // belonged to a different player. Only an exact owner may submit it.
        safeWrite(this.identityStorage, this.identityKey, this.identity);
        this.accountKnown = true;
        safeWrite(this.storage, this.accountMarkerKey, true);
        safeWrite(this.storage, PROFILE_KEY, this.profile);
        this.recoveryOffer = null;
        return { player_id: this.identity.player_id, display_name: this.displayName };
    }
    async rename(name) {
        const value = String(name).trim();
        if (!/^[\p{L}\p{N} _\-\u200c]{2,32}$/u.test(value)) throw new Error('نام باید ۲ تا ۳۲ حرف، عدد یا فاصله داشته باشد.');
        if (this.connected) { await this.ensureIdentity(); await this.request('/player', { method: 'PATCH', authenticated: true, body: { display_name: value } }); }
        this.profile = { display_name: value }; safeWrite(this.storage, PROFILE_KEY, this.profile);
    }
    async start({ width, character, seed } = {}) {
        if (!this.connected || seed !== undefined) return { mode: 'practice', seed: seed ?? Date.now(), track_width: width };
        if (this.needsAccountRestore) return { mode: 'practice', seed: Date.now(), track_width: width,
            reason: 'مدرک امتیاز قبلی محفوظ است؛ برای ارسال آن باید حساب اصلی را بازیابی کنی.' };
        // Do not overwrite a failed ranked run before its replay is accepted/rejected.
        if (this.pending) {
            await this.retry();
            if (this.pending) return { mode: 'practice', seed: Date.now(), track_width: width,
                reason: 'ارسال رکورد قبلی در انتظار اتصال است؛ دور جدید فعلاً تمرینی است.' };
        }
        try {
            await this.ensureIdentity();
            const result = await this.request('/runs', { method: 'POST', authenticated: true,
                body: { request_id: crypto.randomUUID(), game_id: 'dino-run', character_slug: character, track_width: width, rules_version: rules.version } });
            if (result.rules_version !== rules.version) throw new Error('نسخهٔ قوانین تغییر کرده است.');
            return { ...result, mode: 'ranked' };
        } catch (error) {
            if (error.status === 401) { this.identity = null; safeWrite(this.identityStorage, this.identityKey, null); }
            return { mode: 'practice', seed: Date.now(), track_width: width, reason: 'ارتباط آنلاین برقرار نشد؛ این دور روی دستگاه ثبت می‌شود.' };
        }
    }
    async startTurnRun(gameId = 'cafe-critters') {
        const practice = { mode: 'practice', reason: 'این بازی در حالت تمرینی اجرا می‌شود.' };
        if (!['cafe-critters', 'coffee-crash'].includes(gameId) || !this.connected) return practice;
        if (this.needsAccountRestore) return { ...practice,
            reason: 'برای ارسال امتیاز آنلاین ابتدا حساب اصلی را بازیابی کن.' };
        if (this.pending) {
            await this.retry();
            if (this.pending) return { ...practice,
                reason: 'ثبت مدرک قبلی هنوز نهایی نشده است.' };
        }
        try {
            await this.ensureIdentity();
            const expectedVersion = gameId === 'coffee-crash'
                ? 'coffee-crash-replay-v1' : 'cafe-critters-replay-v1';
            const response = await this.request('/turn-runs', {
                method: 'POST', authenticated: true,
                body: { request_id: crypto.randomUUID(), game_id: gameId,
                    rules_version: expectedVersion },
            });
            if (response.game_id !== gameId
                || response.rules_version !== expectedVersion
                || !Number.isSafeInteger(response.seed)) throw new Error('نسخه یا بذر سرور نامعتبر است.');
            return { ...response, mode: 'ranked' };
        } catch (error) {
            if (error.status === 401) {
                this.identity = null;
                safeWrite(this.identityStorage, this.identityKey, null);
            }
            return practice;
        }
    }
    async finishTurnRun(run, actions, ticks) {
        if (run?.mode !== 'ranked'
            || !['cafe-critters', 'coffee-crash'].includes(run.game_id)
            || !Array.isArray(actions) || !Number.isInteger(ticks)) {
            return { status: 'practice' };
        }
        const durable = this.savePending({ id: run.run_id, kind: 'turn',
            body: { ticks, actions: actions.map(action => ({ ...action })) },
            player_id: this.identity?.player_id });
        const result = await this.retry();
        return !durable && result.status !== 'verified'
            ? { status: 'pending', retryable: true,
                message: 'مدرک بازپخش هنوز ذخیره و ارسال نشده است.' }
            : result;
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
        const durable = this.savePending({ id: run.run_id, body: replay.payload(),
            player_id: this.identity?.player_id });
        const result = await this.retry();
        if (!durable && result.status !== 'verified') {
            return { status: 'pending', retryable: true,
                message: 'مرورگر امکان ذخیرهٔ پایدار مدرک را نداد؛ پیش از بستن صفحه اتصال را برقرار کن.' };
        }
        return result;
    }
    async retry() {
        // At most one in-flight POST per tab, even when the menu and the
        // connectivity event request a retry simultaneously.
        if (this.retryPromise) return this.retryPromise;
        this.retryPromise = this.retryPending();
        try { return await this.retryPromise; }
        finally { this.retryPromise = null; }
    }
    async retryPending() {
        if (!this.pending) return { status: 'practice' };
        if (this.hasRecoveryRequired) return { status: 'pending', retryable: false,
            message: 'برای ارسال این مدرک، حساب اصلی را بازیابی کن.' };
        const pending = this.pending;
        try {
            const prefix = pending.kind === 'turn' ? 'turn-runs' : 'runs';
            const result = await this.request(`/${prefix}/${encodeURIComponent(pending.id)}/complete`, { method: 'POST', authenticated: true, body: pending.body });
            if (this.pending === pending) this.savePending(null);
            return result;
        } catch (error) {
            const retryable = !error.status || error.status >= 500 || error.status === 429;
            if (error.status === 401) {
                this.identity = null;
                safeWrite(this.identityStorage, this.identityKey, null);
            }
            // Terminal failures are retained in a bounded, inspectable local
            // archive. They must not indefinitely block new ranked runs.
            const terminal = !retryable && error.status !== 401;
            if (terminal && this.pending === pending) this.archiveRejected(pending, error.status);
            return { status: terminal ? 'rejected' : 'pending',
                retryable: retryable && error.status !== 401, message: error.message };
        }
    }
    async games() {
        if (!this.connected) return { games: [], mode: 'device' };
        return { ...await this.request('/games'), mode: 'online' };
    }
    async currentPlayer() {
        await this.ensureIdentity();
        return this.request('/player', { authenticated: true });
    }
    async myCoupons() {
        if (!this.connected || !this.identity?.token) return [];
        try {
            const data = await this.request('/player/coupons', { authenticated: true });
            return Array.isArray(data.data) ? data.data : [];
        } catch (error) {
            if (error.status === 401) {
                this.identity = null;
                safeWrite(this.identityStorage, this.identityKey, null);
            }
            throw error;
        }
    }
    async personalBest(period = 'weekly') {
        if (!this.connected || !this.identity?.token) return null;
        try {
            return await this.request(`/player/best?period=${encodeURIComponent(period)}`,
                { authenticated: true });
        } catch (error) {
            if (error.status === 401) {
                this.identity = null;
                safeWrite(this.identityStorage, this.identityKey, null);
            }
            return null; // Personal stats must never prevent public leaderboard.
        }
    }
    async eraseAccount() {
        if (this.accountKnown && !this.connected) {
            throw new Error('برای حذف حساب جهانی، اتصال به سرور لازم است.');
        }
        if (this.connected && this.accountKnown && !this.identity?.token) {
            throw new Error('برای حذف کامل اطلاعات سرور، ابتدا حساب اصلی را بازیابی کن.');
        }
        if (this.identity?.token && this.connected) {
            await this.request('/player', { method: 'DELETE', authenticated: true });
        }
        this.identity = null;
        this.savePending(null);
        this.rejected = [];
        safeWrite(this.storage, this.rejectedKey, []);
        this.accountKnown = false;
        safeWrite(this.storage, this.accountMarkerKey, false);
        this.profile = { display_name: 'بازیکن کافه' };
        safeWrite(this.identityStorage, this.identityKey, null);
        try { this.storage?.removeItem?.(this.identityKey); } catch {}
        safeWrite(this.storage, PROFILE_KEY, this.profile);
        safeWrite(this.storage, LOCAL_KEY, []);
        return { status: 'deleted' };
    }
    async list(period = 'weekly') {
        if (this.connected && period !== 'device') return { ...await this.request(`/leaderboards/dino-run?period=${encodeURIComponent(period)}&limit=20`), mode: 'online' };
        return { mode: 'device', data: this.localScores().map((row, index) => ({ ...row, rank: index + 1 })) };
    }
}
