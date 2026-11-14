import { cafeRouteGoals, CAFE_ROUTE_LIMITS } from './CafeRouteGoalCatalog.js';

/**
 * Explicit opt-in timed route challenge. The original casual game keeps its
 * original local score; only this bounded route proof goes to the server.
 *
 * Called with genuine game-engine positions and real interaction events.
 * Proof cannot be promoted to a weekly prize without independent gate.
 */
export default class RankedRouteChallenge {
    constructor({ context, gameId, position, onStart }) {
        this.context = context;
        this.gameId = gameId;
        this.position = position;
        this.onStart = onStart;
        this.run = null;
        this.actions = [];
        this.goals = [];
        this.frame = 0;
        this.nextGoal = 0;
        this.lastMoveFrame = 0;
        this.state = 'idle';
        this.nonce = 0;
        this.panel = null;
    }

    mount() {
        const root = this.context.root.querySelector('[data-game-hud-host]');
        if (!root || this.panel) return;
        const panel = document.createElement('section');
        panel.className = 'ranked-route-challenge';
        panel.setAttribute('role', 'group');
        panel.setAttribute('aria-label', 'چالش رقابتی مسیر کافه');
        const title = document.createElement('h3');
        title.textContent = 'چالش مسیر کافه';
        const description = document.createElement('p');
        description.textContent = 'برای ثبت امتیاز سروری، یک مسیر زمان‌دار مستقل از حالت تمرینی آغاز کن.';
        const status = document.createElement('p');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'شروع چالش ثبت امتیاز';
        button.addEventListener('click', () => { void this.start(); });
        panel.append(title, description, status, button);
        root.append(panel);
        this.panel = panel;
        this.button = button;
        this.status = status;
        this.setMessage('جوایز واقعی فقط پس از تأیید امنیت و سیاست مالی کافه فعال می‌شوند.');
    }

    setMessage(value) {
        if (this.status) this.status.textContent = value;
    }

    async start() {
        if (this.context.app?.sessionState !== 'playing') {
            this.setMessage('این چالش تنها هنگام اجرای فعال بازی قابل شروع است.');
            return;
        }
        if (this.state === 'starting' || this.state === 'running'
            || this.state === 'submitting') return;
        const nonce = ++this.nonce;
        this.state = 'starting';
        if (this.button) this.button.disabled = true;
        this.setMessage('در حال دریافت بذر و قوانین چالش از سرور…');
        try {
            const service = this.context.services.leaderboards;
            if (!service) throw new Error('سرویس امتیازدهی در دسترس نیست.');
            const run = await service.startTurnRun(this.gameId);
            if (nonce !== this.nonce) return;
            if (run?.mode !== 'ranked') throw new Error(
                'چالش رقابتی هنوز فعال نیست. می‌توانی بازی را تمرینی ادامه بدهی.'
            );
            const goals = cafeRouteGoals(this.gameId, run.seed);
            if (Array.isArray(run.goals) && (
                run.goals.length !== goals.length
                || run.goals.some((goal, i) => goal.id !== goals[i].id)
            )) throw new Error('قوانین سرور و کلاینت همخوان نیست.');
            await this.onStart?.(run);
            if (nonce !== this.nonce) return;
            this.run = run;
            this.actions = [];
            this.goals = goals;
            this.frame = 0;
            this.lastMoveFrame = 0;
            this.nextGoal = 0;
            this.state = 'running';
            this.setMessage('مقصد ۱: ' + goals[0].title);
        } catch (error) {
            if (nonce !== this.nonce) return;
            this.run = null;
            this.state = 'idle';
            this.setMessage(error.message || 'چالش در دسترس نیست؛ بازی تمرینی باقی می‌ماند.');
            if (this.button) this.button.disabled = false;
        }
    }

    /** Fixed 60Hz updates, not user-controlled reported seconds. */
    tick(dt) {
        if (this.state !== 'running' || !Number.isFinite(dt) || dt <= 0) return;
        this.frame++;
        if (this.frame >= CAFE_ROUTE_LIMITS[this.gameId] - 1
            || this.actions.length >= 6498) {
            this.state = 'expired';
            this.setMessage('زمان یا حجم مدرک چالش تمام شد؛ امتیاز آنلاین ثبت نشد.');
            if (this.button) this.button.disabled = false;
            return;
        }
        if (this.frame - this.lastMoveFrame >= 10) this.recordMove();
    }

    recordMove() {
        if (this.state !== 'running') return;
        const p = this.position?.();
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) {
            this.state = 'invalid';
            return;
        }
        const previous = this.actions.at(-1)?.tick ?? -1;
        const tick = Math.max(this.frame, previous + 1);
        if (tick >= CAFE_ROUTE_LIMITS[this.gameId]) return;
        this.actions.push({
            tick, kind: 'move',
            x: Math.round(p.x * 10000) / 10000,
            z: Math.round(p.z * 10000) / 10000,
        });
        this.lastMoveFrame = tick;
    }

    checkpoint(target) {
        if (this.state !== 'running') return false;
        const goal = this.goals[this.nextGoal];
        if (!goal || goal.id !== target) return false;
        const p = this.position?.();
        if (!p || Math.hypot(p.x - goal.x, p.z - goal.z) >= 2.0) return false;
        const minTick = this.actions.at(-1)?.tick ?? -1;
        // Record exact physical position at the interaction, not an old sample.
        this.recordMove();
        const checkTick = Math.max(this.frame, (this.actions.at(-1)?.tick ?? -1) + 1);
        if (checkTick >= CAFE_ROUTE_LIMITS[this.gameId]) return false;
        this.actions.push({ tick: checkTick, kind: 'checkpoint', target });
        this.nextGoal++;
        if (this.nextGoal === this.goals.length) {
            void this.complete();
        } else {
            this.setMessage('مقصد ' + (this.nextGoal+1) + ': '
                + this.goals[this.nextGoal].title);
        }
        return true;
    }

    async complete() {
        if (this.state !== 'running') return;
        const nonce = this.nonce;
        this.state = 'submitting';
        this.setMessage('در حال اعتبارسنجی حرکت و تعامل در سرور…');
        try {
            const last = this.actions.at(-1);
            const result = await this.context.services.leaderboards.finishTurnRun(
                this.run, this.actions, last.tick + 1
            );
            if (nonce !== this.nonce) return;
            if (result.status === 'verified') {
                this.state = 'verified';
                this.setMessage('امتیاز تأییدشدهٔ چالش: ' + result.score);
            } else {
                this.state = 'pending';
                this.setMessage('مدرک ارسال نشد؛ برای بازیابی به لیدربورد مراجعه کن.');
            }
        } catch (error) {
            if (nonce !== this.nonce) return;
            this.state = 'pending';
            this.setMessage('ثبت امتیاز تأیید نشد: ' + (error.message ?? 'خطای شبکه'));
        } finally {
            if (nonce === this.nonce && this.button) this.button.disabled = false;
        }
    }

    stop() {
        this.nonce++;
        this.run = null;
        this.actions = [];
        this.state = 'idle';
        this.panel?.remove();
        this.panel = null;
    }
}
