/**
 * Original-game input recording. Only canonical controls are transmitted:
 * no client score, player position, shadow location, ticket or tray state.
 *
 * The backend replays these controls at fixed 60Hz with independently ported
 * game physics and seeded rules. Ranked/prize gates are OFF by default.
 */
export default class RankedGameplayChallenge {
    static VERSIONS = Object.freeze({
        'after-hours': 'after-hours-frames-v1',
        'cafe-rush': 'cafe-rush-frames-v1',
    });
    static LIMITS = Object.freeze({
        'after-hours': 18000,
        'cafe-rush': 7200,
    });
    static MAX_EVENTS = Object.freeze({
        'after-hours': 6500,
        'cafe-rush': 7200,
    });

    constructor({ context, gameId, onStart }) {
        if (!Object.hasOwn(RankedGameplayChallenge.VERSIONS, gameId)) {
            throw new TypeError('Original gameplay challenge is not supported.');
        }
        this.context = context;
        this.gameId = gameId;
        this.onStart = onStart;
        this.run = null;
        this.frames = [];
        this.frame = 0;
        this.lastInput = null;
        this.powerPending = null;
        this.state = 'idle';
        this.nonce = 0;
        this.panel = null;
    }

    mount() {
        const root = this.context.root?.querySelector?.('[data-game-hud-host]');
        if (!root || this.panel) return;
        const panel = document.createElement('section');
        panel.className = 'ranked-route-challenge ranked-gameplay-challenge';
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', 'ثبت امتیاز تأییدشده بازی اصلی');
        const heading = document.createElement('h3');
        heading.textContent = 'چالش امتیاز واقعی';
        const explanation = document.createElement('p');
        explanation.textContent = 'امتیاز فقط از بازپخش مستقل ورودی‌های بازی در سرور محاسبه می‌شود.';
        this.status = document.createElement('p');
        this.status.setAttribute('role', 'status');
        this.status.setAttribute('aria-live', 'polite');
        this.button = document.createElement('button');
        this.button.type = 'button';
        this.button.textContent = 'شروع بازی رقابتی';
        this.button.addEventListener('click', () => { void this.start(); });
        panel.append(heading, explanation, this.status, this.button);
        root.append(panel);
        this.panel = panel;
        this.message('کوپن واقعی تا پایان ارزیابی ضدتقلب و تأیید کافه غیرفعال است.');
    }

    message(value) {
        if (this.status) this.status.textContent = String(value);
    }

    async start() {
        if (this.context.app?.sessionState !== 'playing') {
            this.message('چالش فقط هنگام اجرای فعال بازی قابل شروع است.');
            return;
        }
        if (['starting', 'running', 'submitting'].includes(this.state)) return;
        const nonce = ++this.nonce;
        this.state = 'starting';
        if (this.button) this.button.disabled = true;
        this.message('در حال دریافت قوانین و بذر امتیازدهی از سرور...');
        try {
            const service = this.context.services.leaderboards;
            if (!service) throw new Error('سرور رقابت در دسترس نیست.');
            const run = await service.startTurnRun(this.gameId, { gameplay: true });
            if (nonce !== this.nonce) return;
            if (run?.mode !== 'ranked') throw new Error(
                'مسابقه اصلی غیرفعال است؛ بازی همچنان به‌صورت تمرینی اجرا می‌شود.'
            );
            if (run.game_id !== this.gameId
                || run.rules_version !== RankedGameplayChallenge.VERSIONS[this.gameId]
                || !Number.isSafeInteger(run.seed) || run.seed < 1
                || !/^[0-9a-f-]{36}$/i.test(String(run.run_id ?? ''))) {
                throw new Error('پاسخ نسخه یا شناسه مسابقه نامعتبر است.');
            }
            await this.onStart?.(run);
            if (nonce !== this.nonce) return;
            this.run = run;
            this.frames = [];
            this.frame = 0;
            this.lastInput = null;
            this.powerPending = null;
            this.state = 'running';
            this.message('ورودی‌ها در ۶۰ فریم بر ثانیه ثبت می‌شوند؛ توقف طولانی مجاز نیست.');
        } catch (error) {
            if (nonce !== this.nonce) return;
            this.run = null;
            this.state = 'idle';
            this.message(error.message || 'امتیاز آنلاین در دسترس نیست.');
            if (this.button) this.button.disabled = false;
        }
    }

    /**
     * The ORIGINAL JS model must use these quantized inputs, not raw axes,
     * to ensure its numerical simulation equals the independent PHP replay.
     */
    prepareInput(input = {}) {
        if (this.state !== 'running') return input;
        const axis = v => Math.round(
            Math.max(-1, Math.min(1, Number.isFinite(Number(v)) ? Number(v) : 0)) * 1000
        ) / 1000;
        return {
            ...input,
            x: axis(input.x), z: axis(input.z),
            run: Boolean(input.run), interact: Boolean(input.interact),
        };
    }

    /** Called when After Hours' real panel dialog makes a power selection.
     * No physics frame passes while the modal is open; apply it next tick.
     */
    queuePower(circuit) {
        if (this.state !== 'running') return;
        if (!['storage', 'counter', 'exit'].includes(circuit)) {
            this.invalidate('مدار برق نامعتبر است.');
            return;
        }
        this.powerPending = circuit;
    }

    tick(input = {}) {
        if (this.state !== 'running') return;
        if (++this.frame > RankedGameplayChallenge.LIMITS[this.gameId]) {
            this.invalidate('زمان مجاز دور رقابتی تمام شد.');
            return;
        }
        const clean = this.prepareInput(input);
        const power = this.powerPending;
        const interact = Boolean(clean.interact) || power !== null;
        const frameEvent = this.gameId === 'after-hours'
            ? [this.frame, clean.x, clean.z, Number(clean.run), Number(interact), power]
            : [this.frame, clean.x, clean.z, Number(clean.run), Number(interact)];
        const changed = !this.lastInput || frameEvent.slice(1).some(
            (value, index) => value !== this.lastInput[index+1]
        );
        if (changed) this.frames.push(frameEvent);
        this.lastInput = frameEvent;
        this.powerPending = null;
        if (this.frames.length > RankedGameplayChallenge.MAX_EVENTS[this.gameId]) {
            this.invalidate('حجم ورودی‌های رقابتی از حد ایمن فراتر رفت.');
        }
    }

    invalidate(reason) {
        this.state = 'invalid';
        this.message(reason);
        if (this.button) this.button.disabled = false;
    }

    async finish(won) {
        if (this.state !== 'running') return;
        if (!won) {
            this.invalidate('امتیاز این دور به شرایط پایان موفق نرسید.');
            return;
        }
        if (this.gameId === 'cafe-rush' && this.frame !== 7200) {
            this.invalidate('شیفت رقابتی باید ۱۲۰ ثانیه کامل اجرا شود.');
            return;
        }
        if (!this.frames.length) {
            this.invalidate('مدرک ورودی رقابتی خالی است.');
            return;
        }
        if (this.frames.at(-1)[0] !== this.frame) {
            const last = this.lastInput;
            this.frames.push(this.gameId === 'after-hours'
                ? [this.frame, last[1], last[2], last[3], 0, null]
                : [this.frame, last[1], last[2], last[3], 0]);
        }
        if (this.frames.length > RankedGameplayChallenge.MAX_EVENTS[this.gameId]) {
            this.invalidate('مدرک رقابتی بیش از سقف مجاز است.');
            return;
        }
        const nonce = this.nonce;
        this.state = 'submitting';
        this.message('بازپخش مستقل روی سرور در حال اعتبارسنجی است...');
        try {
            const result = await this.context.services.leaderboards.finishGameplayRun(
                this.run, this.frames, this.frame
            );
            if (nonce !== this.nonce) return;
            if (result.status === 'verified') {
                this.state = 'verified';
                this.message('امتیاز اصلی تأییدشده سرور: ' + result.score);
            } else {
                this.state = 'pending';
                this.message('نتیجه هنوز تأیید نشده؛ برای بازیابی به لیدربورد مراجعه کن.');
            }
        } catch (error) {
            if (nonce !== this.nonce) return;
            this.state = 'pending';
            this.message('ارسال مدرک ناموفق بود: ' + (error.message || 'خطای اتصال'));
        } finally {
            if (nonce === this.nonce && this.button) this.button.disabled = false;
        }
    }

    stop() {
        ++this.nonce;
        this.frames = [];
        this.run = null;
        this.state = 'idle';
        this.powerPending = null;
        this.panel?.remove();
        this.panel = null;
    }
}
