import BaseGame from '../../contracts/BaseGame.js';
import { assignUiLayer, UI_LAYER } from '../../ui/UiLayer.js';
import CafeCueAudio from '../../shared/cafe/CafeCueAudio.js';
import CafeDriftModel, { clamp, driftSeed, DRIFT } from './CafeDriftModel.js';
import CafeDriftRenderer from './CafeDriftRenderer.js';
import '../../../../css/cafe-drift.css';

const ID = 'cafe-drift';
const digits = new Intl.NumberFormat('fa-IR');
const feedback = { hit: 'فنجان شکست!', near: 'جاخالی میلی‌متری!', bean: 'دانهٔ طلایی!', double: 'جاخالی + دانهٔ طلایی!' };

export default class CafeDriftGame extends BaseGame {
    constructor() {
        super();
        this.audio = new CafeCueAudio({
            near: [420, 700, .105, .095, 'triangle'],
            bean: [605, 980, .15, .07, 'sine'],
            double: [520, 1240, .20, .09, 'triangle'],
            hit: [230, 110, .20, .09, 'triangle'],
            win: [440, 880, .28, .09, 'sine'],
        });
        this.supportsInPlaceRestart = true;
        this.listeners = new AbortController();
        this.generation = 0;
    }

    enter(context) {
        this.context = context;
        this.model = new CafeDriftModel(driftSeed());
        this.renderer = new CafeDriftRenderer(context.renderer);
        const section = document.createElement('section');
        assignUiLayer(section, UI_LAYER.LOCAL_BASE);
        section.className = 'drift-hud';
        section.dir = 'rtl';
        section.setAttribute('aria-label', 'کافه دریفت');
        section.innerHTML = `
            <div class="drift-hud__pointer" data-drift-pointer></div>
            <div class="drift-hud__stats">
                <span><small>امتیاز</small><strong data-drift-score>۰</strong></span>
                <span><small>کمبو</small><strong data-drift-combo>×۱</strong></span>
                <span><small>فنجان</small><strong data-drift-cups>۳</strong></span>
                <span><small>ثانیه</small><strong data-drift-time>۴۵</strong></span>
                <progress class="drift-hud__clock" data-drift-clock aria-label="زمان باقی‌ماندهٔ شیفت" max="45" value="45"></progress>
            </div>
            <span class="drift-hud__mode" data-drift-mode></span>
            <p class="drift-hud__callout" data-drift-cue role="status" hidden></p>
            <div class="drift-entry" data-drift-entry>
                <div class="drift-entry__mark" aria-hidden="true"><i></i><i></i><i></i></div>
                <h2>دریفت سینی</h2>
                <p>در ۴۵ ثانیه سینی را از میان موانع رد کن. جاخالی میلی‌متری و دانهٔ طلایی را پشت‌سرهم بگیر تا امتیازت تا پنج برابر شود.</p>
                <p class="drift-entry__guide">روی مسیر بکش یا از کلیدهای جهت استفاده کن.</p>
                <div class="drift-entry__actions">
                    <button type="button" class="shell-button shell-button--primary" data-drift-start>شروع رقابت</button>
                    <button type="button" class="shell-button shell-button--ghost" data-drift-practice>تمرین</button>
                </div>
                <div class="drift-entry__links">
                    <button type="button" data-shell-action="leaderboard">جدول هفتگی</button>
                    <button type="button" data-shell-action="rewards">تخفیف‌های من</button>
                </div>
                <p class="drift-entry__status" data-drift-status role="status">توقف یا ترک صفحه، دور رقابتی را به تمرین تبدیل می‌کند.</p>
            </div>`;
        this.hud = section;
        const nodes = this.nodes = {};
        for (const name of ['pointer', 'score', 'combo', 'cups', 'time', 'clock', 'mode', 'cue', 'entry', 'start', 'practice', 'status']) {
            nodes[name] = section.querySelector(`[data-drift-${name}]`);
        }
        context.root.querySelector('[data-game-hud-host]').append(section);
        const { signal } = this.listeners;
        nodes.start.addEventListener('click', () => { void this.begin(true); }, { signal });
        nodes.practice.addEventListener('click', () => { void this.begin(false); }, { signal });
        nodes.pointer.addEventListener('pointerdown', event => this.steer(event), { signal });
        nodes.pointer.addEventListener('pointermove', event => this.steer(event), { signal });
        for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
            nodes.pointer.addEventListener(event, e => {
                if (e.pointerId !== this.pointerId) return;
                this.pointerId = null;
                // A canceled OS gesture must not leave a stale steering command.
                if (event !== 'pointerup') this.pointerTarget = null;
            }, { signal });
        }
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.resetPointer();
                this.invalidateRanking();
            }
        }, { signal });
    }

    startSession() {
        // Soft retries need the same clean entry state as a fresh instance.
        this.generation++;
        this.resetPointer();
        this.active = false;
        this.starting = false;
        this.rankRun = null;
        this.frames = [];
        this.effect = null;
        this.target = 0;
        this.model = new CafeDriftModel(driftSeed());
        this.nodes.pointer.hidden = true;
        this.nodes.cue.hidden = true;
        this.nodes.mode.hidden = true;
        this.nodes.entry.hidden = false;
        this.nodes.start.disabled = this.nodes.practice.disabled = false;
        this.nodes.status.textContent = 'توقف یا ترک صفحه، دور رقابتی را به تمرین تبدیل می‌کند.';
        this.updateHud();
    }

    resetPointer() {
        const id = this.pointerId;
        this.pointerId = null;
        this.pointerTarget = null;
        if (id === null || id === undefined) return;
        try {
            const node = this.nodes?.pointer;
            if (node?.hasPointerCapture?.(id)) node.releasePointerCapture(id);
        } catch { /* A detached/hidden control may have already lost capture. */ }
    }

    steer(event) {
        if (!this.active || this.context.app.sessionState !== 'playing' || event.button > 0) return;
        if (event.type === 'pointerdown' && this.pointerId === null) {
            this.pointerId = event.pointerId;
            try { this.nodes.pointer.setPointerCapture?.(event.pointerId); }
            catch { /* Capture is optional; pointer cancel still clears control. */ }
        }
        if (this.pointerId !== event.pointerId) return;
        const rect = this.nodes.pointer.getBoundingClientRect();
        if (rect.width > 0) this.pointerTarget = this.renderer.target((event.clientX - rect.left) / rect.width);
    }

    async begin(competitive) {
        if (this.active || this.starting || this.context.app.sessionState !== 'playing') return;
        this.audio.unlock();
        this.starting = true;
        const generation = ++this.generation;
        const { start, practice, status } = this.nodes;
        start.disabled = practice.disabled = true;
        status.textContent = competitive ? 'در حال آماده کردن مسیر هفتگی…' : '';
        let offered;
        try {
            if (competitive) offered = await this.context.services.leaderboards.startTurnRun(ID);
        } catch {}
        if (generation !== this.generation) return;
        const valid = offered?.mode === 'ranked' && offered.game_id === ID && offered.rules_version === DRIFT.version
            && typeof offered.run_id === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(offered.run_id)
            && Number.isSafeInteger(offered.seed) && offered.seed > 0 && offered.seed < 2147483647
            && Date.parse(offered.expires_at) > Date.now();
        this.rankRun = valid && this.context.app.sessionState === 'playing' && !document.hidden ? offered : null;
        this.model = new CafeDriftModel(this.rankRun?.seed ?? driftSeed());
        this.active = true;
        this.target = 0;
        this.resetPointer();
        this.frames = [];
        this.effect = null;
        this.starting = false;
        start.disabled = practice.disabled = false;
        this.nodes.entry.hidden = true;
        this.nodes.pointer.hidden = false;
        this.nodes.mode.hidden = false;
        this.nodes.mode.textContent = this.rankRun ? 'رقابت هفتگی' : 'تمرین · رکورد دستگاه';
        this.updateHud();
    }

    fixedUpdate(_dt, input) {
        if (!this.active) {
            if (input.interact) void this.begin(true);
            return;
        }
        if (this.model.tick % DRIFT.sampleTicks === 0) {
            if (input.x) {
                this.pointerTarget = null;
                this.target = clamp(this.target + Math.sign(input.x) * Math.max(1, Math.round(Math.abs(input.x) * DRIFT.steerStep)),
                    -DRIFT.targetMax, DRIFT.targetMax);
            } else if (this.pointerTarget !== null) {
                this.target = this.pointerTarget;
            }
            if (this.rankRun && this.frames.at(-1)?.[1] !== this.target) {
                this.frames.push([this.model.tick, this.target]);
            }
        }
        const scoreBefore = this.model.score;
        const event = this.model.step(this.target);
        if (event) {
            this.effect = { kind: event, tick: this.model.tick, x: this.model.x };
            this.audio.play(event);
            const gained = this.model.score - scoreBefore;
            this.nodes.cue.textContent = gained > 0 ? `${feedback[event]} · ${digits.format(gained)} امتیاز` : feedback[event];
            this.nodes.cue.dataset.kind = event;
            this.nodes.cue.hidden = false;
        } else if (this.effect && this.model.tick - this.effect.tick >= 52) {
            this.nodes.cue.hidden = true;
            this.effect = null;
        }
        if (this.model.tick % 60 === 0 || event || this.model.tick === this.model.gates[this.model.index - 1]?.tick + DRIFT.contactTicks) {
            this.updateHud();
        }
        if (this.model.done) this.finish();
    }

    updateHud() {
        const m = this.model;
        this.nodes.score.textContent = digits.format(m.score);
        this.nodes.combo.textContent = `×${digits.format(m.combo || 1)}`;
        this.nodes.cups.textContent = digits.format(m.cups);
        const remaining = Math.ceil((DRIFT.ticks - m.tick) / 60);
        this.nodes.time.textContent = digits.format(remaining);
        this.nodes.clock.value = remaining;
        this.nodes.clock.dataset.ending = String(remaining <= 8);
    }

    finish() {
        this.active = false;
        this.nodes.pointer.hidden = this.nodes.cue.hidden = true;
        this.updateHud();
        const m = this.model;
        const previousBest = this.context.services.leaderboards.deviceRecords(ID)[0]?.score;
        const won = m.cups > 0;
        if (won) this.audio.play('win');
        const ranking = this.rankRun
            ? this.context.services.leaderboards.finishGameplayRun(this.rankRun, [...this.frames, [m.tick, 0]], m.tick)
            : { status: 'practice' };
        this.context.app.completeGame({
            title: won ? 'سینی سالم رسید!' : 'شیفت تمام شد',
            subtitle: won ? 'برای امتیاز بیشتر، جاخالی‌ها و دانه‌های طلایی را زنجیره کن.' : 'کمی زودتر مسیر سینی را عوض کن و دوباره امتحان کن.',
            won, score: m.score, ranking,
            deviceRecord: { score: m.score, ticks: m.tick, passed: m.passed },
            stats: { 'جاخالی نزدیک': digits.format(m.nearMisses), 'دانهٔ طلایی': digits.format(m.beans),
                'بهترین کمبو': digits.format(m.bestCombo), 'فنجان سالم': digits.format(m.cups),
                'رکورد دستگاه': digits.format(Math.max(m.score, previousBest ?? 0)) },
        });
    }

    invalidateRanking() {
        if (!this.active || !this.rankRun) return;
        this.rankRun = null;
        this.frames = [];
        this.nodes.mode.textContent = 'تمرین · دور رقابتی متوقف شد';
    }

    pause() {
        this.resetPointer();
        this.invalidateRanking();
    }

    applySettings(settings) {
        this.reduced = this.context.settings.resolvedReducedMotion();
        this.audio.setEnabled(settings.soundEnabled);
    }

    resize() { this.renderer?.resize(); }

    render(alpha) { this.renderer.render(this.model, alpha, this.effect, this.reduced); }

    dispose() {
        this.generation++;
        this.resetPointer();
        this.listeners.abort();
        this.hud?.remove();
        this.audio.dispose();
    }
}
