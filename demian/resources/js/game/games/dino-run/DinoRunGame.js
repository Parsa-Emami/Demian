import BaseGame from '../../contracts/BaseGame.js';
import DinoRunModel, { RUNNER_CONFIG } from './DinoRunModel.js';
import DinoRunEnvironment from './DinoRunEnvironment.js';
import { BUILTIN_CHARACTER_SLUGS, builtinCharacterAssetPair } from '../../characters/CharacterVisualContract.js';
import { arcadeCharacterLabel } from '../arcade/ArcadeCharacterRoster.js';
import { UI_LAYER, assignUiLayer } from '../../ui/UiLayer.js';
import RunnerReplay from './RunnerReplay.js';
import CanvasCharacterAvatar from '../../characters/CanvasCharacterAvatar.js';

const BEST_KEY = `demian.dino-run.best.${RUNNER_CONFIG.version}`;
const LESSON_KEY = 'demian.dino-run.tutorial.v1';
const scoreDigits = new Intl.NumberFormat('fa-IR', { useGrouping: false, minimumIntegerDigits: 5 });
const statDigits = new Intl.NumberFormat('fa-IR');
const OBSTACLE_LABELS = Object.freeze({
    'coffee-crate': 'جعبهٔ قهوه', chair: 'صندلی', suitcase: 'چمدان', 'traffic-cone': 'مخروط',
    'plant-pot': 'گلدان', 'book-stack': 'دستهٔ کتاب', barrel: 'بشکه', 'floor-fan': 'پنکه',
    pendant: 'چراغ آویز', 'hanging-sign': 'تابلو آویز', 'serving-tray': 'سینی', pipe: 'لوله',
});
const ATTACKER_LABELS = Object.freeze({ uzudi: 'اوزودی', amirreza: 'امیررضا' });
function readBest() { try { return Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0); } catch { return 0; } }
function saveBest(value) { try { localStorage.setItem(BEST_KEY, String(value)); } catch {} }

function collisionGuide(model) {
    if (!model.hitObstacle) return 'زمان این دور تمام شد.';
    const { appearance, response } = model.hitObstacle;
    const name = model.hitBy ? `حملهٔ ${ATTACKER_LABELS[model.hitBy]}` : OBSTACLE_LABELS[appearance] ?? 'برخورد با مانع';
    return `${name} · ${response === 'jump' ? 'برای خطر زمینی، کمی پیش از برخورد بپر.' : 'برای خطر هوایی، اسلاید را تا عبور ادامه بده.'}`;
}

export default class DinoRunGame extends BaseGame {
    constructor() { super(); this.model = new DinoRunModel(); this.best = readBest(); this.finished = false; this.uiTime = 0; }
    async preload(context) {
        this.avatar = await context.services.characterVisuals.createCanvasAvatar('player', { player: true });
        this.attackAvatars = new Map();
        await Promise.all(RUNNER_CONFIG.attackers.map(async (slug) => {
            const base = await context.services.characterVisuals.createCanvasAvatar(slug, { player: true });
            for (const response of ['jump', 'duck']) this.attackAvatars.set(`${slug}:${response}`,
                new CanvasCharacterAvatar({ slug, image: base.texture.image, atlas: base.atlas }));
        }));
    }
    async enter(context) {
        this.context = context;
        this.environment = new DinoRunEnvironment(context.services.performanceProfile);
        this.environment.reducedMotion = context.settings.resolvedReducedMotion();
        void this.environment.load();
        this.actor = { position: { x: RUNNER_CONFIG.playerX, z: 0 }, forward: { x: 1, z: 0 },
            speed: 0, grounded: true, airborne: false, jumpVelocity: 0,
            jumpForce: RUNNER_CONFIG.jumpSpeed / 100, motionState: 'idle' };
        this.characterManager = { characters: [], activeRecord: null,
            select: (id) => this.selectCharacter(id), activate: (id) => this.selectCharacter(id) };
        this.refreshRoster();
        this.hud = assignUiLayer(document.createElement('section'), UI_LAYER.LOCAL_BASE);
        this.hud.className = 'runner-hud'; this.hud.dir = 'rtl';
        this.hud.innerHTML = '<div class="runner-hud__title"><small>DEMIAN / CAFÉ RUN</small><strong>DINO RUN</strong></div><div class="runner-hud__score"><span><small>امتیاز</small><b data-run-score>۰۰۰۰۰</b></span><span><small>رکورد دستگاه</small><b data-run-best>۰۰۰۰۰</b></span></div><button type="button" data-shell-action="leaderboard" aria-label="نمایش لیدربورد">♛</button>';
        this.threat = document.createElement('div');
        this.threat.className = 'runner-threat';
        this.threat.hidden = true;
        this.hud.append(this.threat);
        context.root.querySelector('[data-game-hud-host]')?.append(this.hud);
        this.ready = assignUiLayer(document.createElement('div'), UI_LAYER.LOCAL_BASE);
        this.ready.className = 'runner-ready'; this.ready.dir = 'rtl';
        this.ready.innerHTML = '<span>DEMIAN · CAFÉ RUN</span><h2>این بار، توی کافه بدو.</h2><p>از موانع و حمله‌های زمینی اوزودی و امیررضا بپر؛ زیر موانع و حمله‌های هوایی اسلاید برو. هر برخورد یعنی پایان دور!</p><button type="button" data-input-press="jump" data-input-hold="jumpHeld">شروع و پرش <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V4m-6 6 6-6 6 6"/></svg></button><small data-runner-keyboard-guide>نگه‌دار: پرش بلندتر · Space / ↑ · ↓ برای اسلاید</small><small data-runner-touch-guide>برای پرش بلندتر، دکمهٔ پرش را نگه دار.</small><p data-run-ranking-mode role="status"></p>';
        const lesson = document.createElement('button');
        lesson.type = 'button';
        lesson.className = 'runner-ready__lesson';
        try { this.lessonLearned = localStorage.getItem(LESSON_KEY) === 'done'; } catch {}
        lesson.textContent = this.lessonLearned ? 'مرور پرش و اسلاید' : 'تمرین پیشنهادی · پرش و اسلاید';
        lesson.addEventListener('click', () => this.showLesson('jump'));
        this.ready.querySelector('[data-runner-keyboard-guide]').before(lesson);
        this.lessonPanel = assignUiLayer(document.createElement('section'), UI_LAYER.LOCAL_BASE);
        this.lessonPanel.className = 'runner-ready runner-lesson';
        this.lessonPanel.dir = 'rtl';
        this.lessonPanel.hidden = true;
        this.lessonPanel.innerHTML = '<span data-lesson-step></span><h2 data-lesson-title></h2><p data-lesson-copy role="status"></p><button type="button" data-lesson-start></button><button type="button" class="runner-ready__lesson" data-lesson-exit>بازگشت به شروع</button>';
        this.lessonPanel.querySelector('[data-lesson-start]').addEventListener('click', () => {
            if (this.lessonStep === 'done') this.leaveLesson();
            else this.startLesson();
        });
        this.lessonPanel.querySelector('[data-lesson-exit]').addEventListener('click', () => this.leaveLesson());
        const wordmark = document.createElement('img');
        wordmark.className = 'runner-wordmark'; wordmark.alt = 'دمیان · DEMIAN';
        wordmark.src = new URL('assets/environments/cafe-runner-v1/wordmark.png', document.baseURI).href;
        this.ready.prepend(wordmark);
        context.root.querySelector('[data-game-hud-host]')?.append(this.ready, this.lessonPanel);
        this.scoreNode = this.hud.querySelector('[data-run-score]'); this.bestNode = this.hud.querySelector('[data-run-best]');
        this.resize();
    }
    showLesson(step, missed = false) {
        this.lessonStep = step;
        this.lessonActive = false;
        this.ready.hidden = true;
        this.threat.hidden = true;
        this.lessonPanel.hidden = false;
        const jump = step === 'jump';
        const done = step === 'done';
        this.lessonPanel.querySelector('[data-lesson-step]').textContent = done ? 'تمرین کامل شد' : `تمرین ${jump ? '۱' : '۲'} از ۲`;
        this.lessonPanel.querySelector('[data-lesson-title]').textContent = done ? 'آمادهٔ دویدن هستی' : jump ? '↑ پرش از مانع زمینی' : '↓ اسلاید زیر مانع هوایی';
        this.lessonPanel.querySelector('[data-lesson-copy]').textContent = done ? 'حالا می‌توانی یک دور امتیازی شروع کنی.'
            : missed ? collisionGuide(this.model) : jump ? 'وقتی جعبه نزدیک شد، پرش را بزن. نگه‌داشتن دکمه پرش را بلندتر می‌کند.'
                : 'وقتی چراغ نزدیک شد، اسلاید را تا رد شدن از زیر آن ادامه بده.';
        const start = this.lessonPanel.querySelector('[data-lesson-start]');
        start.textContent = done ? 'رفتن به شروع دور' : missed ? 'تلاش دوباره' : 'شروع این تمرین';
        start.focus();
        if (done) {
            try { localStorage.setItem(LESSON_KEY, 'done'); } catch {}
            this.ready.querySelector('.runner-ready__lesson').textContent = 'مرور پرش و اسلاید';
        }
    }
    startLesson() {
        this.context.input.clearTouch();
        this.model.reset({ width: this.trackWidth, lesson: this.lessonStep });
        this.lessonActive = true;
        this.lessonPanel.hidden = true;
        this.updateHud();
    }
    leaveLesson() {
        this.startSession().then(() => this.ready?.querySelector('[data-input-press="jump"]')?.focus())
            .catch(() => this.context?.app.shell.toast('شروع دور انجام نشد. دوباره تلاش کن.', 'error'));
    }
    refreshRoster() {
        this.characterManager.characters = BUILTIN_CHARACTER_SLUGS.map((slug) => ({
            id: slug, slug, name: arcadeCharacterLabel(slug), is_builtin: true,
            is_active: slug === this.avatar.slug, ...{ sprite_url: builtinCharacterAssetPair(slug).spriteUrl,
                atlas_url: builtinCharacterAssetPair(slug).atlasUrl }, settings: { scale: 1 } }));
        this.characterManager.activeRecord = this.characterManager.characters.find((r) => r.is_active);
    }
    async selectCharacter(slug) {
        if (!BUILTIN_CHARACTER_SLUGS.includes(slug) || this.selecting) return;
        this.selecting = true;
        try {
            const avatar = await this.context.services.characterVisuals.createCanvasAvatar(slug, { player: true });
            this.avatar = avatar; avatar.sync(this.actor, 0);
            this.context.services.characterVisuals.setActiveSlug(slug);
            this.refreshRoster();
            this.context.eventBus.emit('characters:changed', this.characterManager.characters);
            this.context.eventBus.emit('character:selected', { record: this.characterManager.activeRecord });
            if (this.model.status === 'ready' && !this.lessonStep) await this.startSession();
            else if (this.run?.mode === 'ranked') this.run.mode = 'practice';
        } finally { this.selecting = false; }
    }
    async startSession({ seed } = {}) {
        this.starting = true; this.finished = false;
        this.lessonStep = null; this.lessonActive = false;
        this.lessonPanel.hidden = true;
        this.run = null; this.replay = new RunnerReplay();
        const width = Math.round(Math.min(RUNNER_CONFIG.maxWidth, Math.max(RUNNER_CONFIG.minWidth, this.trackWidth)));
        this.run = this.context.services.leaderboards
            ? await this.context.services.leaderboards.start({ width, character: this.avatar.slug, seed })
            : { mode: 'practice', seed: seed ?? Date.now(), track_width: width };
        if (!this.context) return;
        this.model.reset({ seed: this.run.seed, width: this.run.track_width });
        this.actor.speed = 0; this.actor.airborne = false; this.actor.grounded = true; this.actor.motionState = 'idle';
        this.avatar.sync(this.actor, 0);
        const status = this.ready.querySelector('[data-run-ranking-mode]');
        if (status) status.textContent = this.run.mode === 'ranked' ? 'این دور برای لیدربورد آنلاین ثبت می‌شود.'
            : this.run.reason ?? 'رکورد این دور روی همین دستگاه ذخیره می‌شود.';
        this.starting = false; this.ready.hidden = false; this.updateHud();
    }
    fixedUpdate(dt, input = {}) {
        if (!this.context || this.context.app.sessionState !== 'playing' || this.context.root.dataset.sidebarState === 'expanded' || this.finished || this.starting) return;
        if (this.lessonStep && !this.lessonActive) return;
        if (!this.lessonStep && this.replay && (this.model.status !== 'ready' || input.jump)) this.replay.record(input);
        this.model.step(dt, input);
        const model = this.model;
        this.actor.speed = model.status === 'ready' ? 0 : Math.min(8.4, 6 * model.speed / RUNNER_CONFIG.startSpeed);
        this.actor.travelledDistance = this.actor.speed * dt;
        this.actor.airborne = model.y > 0 || model.vy > 0; this.actor.grounded = !this.actor.airborne;
        this.actor.jumpVelocity = model.vy / 100;
        this.actor.motionState = model.duck ? 'slide' : model.landingTime > 0 ? 'land' : null;
        this.avatar.sync(this.actor, dt);
        for (const [key, avatar] of this.attackAvatars ?? []) {
            const airborne = key.endsWith(':duck');
            avatar.sync({ position: { x: 0, z: 0 }, forward: { x: -1, z: 0 }, speed: 7.2,
                travelledDistance: 7.2 * dt, grounded: !airborne, airborne,
                jumpVelocity: airborne ? -1 : 0, jumpForce: RUNNER_CONFIG.jumpSpeed / 100 }, dt);
        }
        if (this.lessonActive) {
            if (model.status === 'over') this.showLesson(this.lessonStep, true);
            else if (model.passed) this.showLesson(this.lessonStep === 'jump' ? 'duck' : 'done');
        } else if (model.status === 'over') this.finish();
    }
    update(dt = 0) {
        this.uiTime += dt;
        if (this.uiTime >= .1) { this.uiTime = 0; this.updateHud(); }
    }
    updateHud() {
        if (!this.hud) return;
        const score = this.lessonStep ? 0 : this.model.score;
        this.scoreNode.textContent = scoreDigits.format(score);
        this.bestNode.textContent = scoreDigits.format(Math.max(this.best, score));
        this.ready.hidden = this.starting || Boolean(this.lessonStep) || this.model.status !== 'ready';
        const model = this.model;
        const obstacle = model.status === 'running' && (!this.lessonStep || this.lessonActive)
            ? model.obstacles.find((entry) => !entry.scored && entry.x + entry.w >= RUNNER_CONFIG.playerX
                && entry.x - RUNNER_CONFIG.playerX < model.speed * 1.4)
            : null;
        this.threat.hidden = !obstacle;
        if (obstacle) {
            const cue = obstacle.response === 'jump' ? '↑ زمینی · پرش' : '↓ هوایی · اسلاید';
            this.threat.dataset.response = obstacle.response;
            if (this.threat.textContent !== cue) this.threat.textContent = cue;
        }
    }
    finish() {
        if (this.finished) return;
        this.finished = true;
        const previousBest = this.best; this.best = Math.max(this.best, this.model.score); saveBest(this.best);
        this.context.app.completeGame({ title: this.model.score > previousBest ? 'رکورد تازه!' : 'یک بار دیگر؟',
            subtitle: collisionGuide(this.model), score: this.model.score, won: false,
            ranking: this.context.services?.leaderboards?.finish(this.run, this.model, this.replay, this.avatar.slug),
            stats: { 'رکورد': statDigits.format(this.best), 'موانع ردشده': statDigits.format(this.model.passed), 'زمان': `${statDigits.format(Math.floor(this.model.time))} ثانیه`,
                'کاراکتر': arcadeCharacterLabel(this.avatar.slug) } });
    }
    resize() {
        if (!this.context) return;
        this.environment.tier = this.context.renderer.quality?.quality ?? 'balanced';
        this.context.renderer.resizeSmooth();
        const { width, height } = this.context.renderer.logicalDimensions();
        this.width = width; this.height = height;
        this.scale = Math.min(height / 430, width / 420);
        this.trackWidth = Math.round(Math.min(RUNNER_CONFIG.maxWidth, Math.max(RUNNER_CONFIG.minWidth, width / this.scale)));
        if (!this.run) this.model.setWidth(this.trackWidth);
        const portrait = width < height;
        this.ground = portrait ? height * .67 : height * .74;
    }
    render(alpha) {
        if (!this.context) return;
        const ctx = this.context.renderer.beginFrame('#eee9dc');
        const { width: w, height: h, scale: s, ground: ground } = this;
        const frame = this.model.snapshot(alpha); const distance = frame.distance;
        const light = this.environment.draw(ctx, { width: w, height: h, ground, scale: s, distance, time: this.model.time });
        this.environment.drawObstacles(ctx, frame.obstacles, { ground, scale: s, time: this.model.time, night: light.night });
        this.drawAttackers(ctx, frame.obstacles, alpha);
        this.environment.drawDust(ctx, { x: RUNNER_CONFIG.playerX * s, ground, scale: s, time: this.model.time,
            sliding: this.model.duck, running: this.model.status === 'running' && this.model.y === 0 });
        const avatar = this.avatar, sample = avatar.animator.sample(alpha);
        const sprite = avatar.atlas.frames[sample.frameName];
        if (sprite) {
            const ratio = avatar.atlas.render?.referenceBodyHeightRatio ?? .9;
            const spriteSize = RUNNER_CONFIG.bodyHeight / ratio * s;
            const x = RUNNER_CONFIG.playerX * s, y = ground - frame.y * s;
            const lift = Math.min(1, frame.y / 120);
            ctx.fillStyle = `rgba(35,48,32,${.18 * (1 - lift * .65)})`;
            ctx.beginPath(); ctx.ellipse(x, ground, (25 - lift * 7) * s, (3 + lift) * s, 0, 0, Math.PI * 2); ctx.fill();
            ctx.save(); ctx.translate(x, y);
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(avatar.texture.image, sprite.x, sprite.y, sprite.w, sprite.h,
                -spriteSize * (avatar.atlas.pivot?.x ?? .5), -spriteSize * (avatar.atlas.pivot?.y ?? .965), spriteSize, spriteSize);
            ctx.restore();
        }
        this.context.renderer.present();
    }
    drawAttackers(ctx, obstacles, alpha) {
        const s = this.scale;
        for (const obstacle of obstacles) {
            if (!obstacle.attacker || obstacle.x > this.width / s + 80 || obstacle.x + obstacle.w < 0) continue;
            const avatar = this.attackAvatars?.get(`${obstacle.attacker}:${obstacle.response}`);
            const sprite = avatar?.atlas.frames[avatar.animator.sample(alpha).frameName];
            if (!sprite) continue;
            const size = RUNNER_CONFIG.bodyHeight / (avatar.atlas.render?.referenceBodyHeightRatio ?? .9) * s;
            const x = (obstacle.x + obstacle.w / 2) * s, y = this.ground - obstacle.y * s;
            ctx.save();
            ctx.fillStyle = 'rgba(55,20,15,.25)'; ctx.beginPath();
            ctx.ellipse(x, this.ground, 25 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
            if (!this.environment.reducedMotion) {
                ctx.strokeStyle = 'rgba(255,139,94,.65)'; ctx.lineWidth = 2 * s;
                for (let i = 0; i < 3; i++) {
                    ctx.beginPath(); ctx.moveTo(x + 25 * s, y - (14 + 12 * i) * s);
                    ctx.lineTo(x + (42 + 9 * i) * s, y - (14 + 12 * i) * s); ctx.stroke();
                }
            }
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(avatar.texture.image, sprite.x, sprite.y, sprite.w, sprite.h,
                x - size * (avatar.atlas.pivot?.x ?? .5), y - size * (avatar.atlas.pivot?.y ?? .965), size, size);
            const label = `← ${ATTACKER_LABELS[obstacle.attacker]}`;
            ctx.direction = 'rtl';
            ctx.font = `700 ${12 * s}px Vazirmatn, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const labelWidth = ctx.measureText(label).width + 16 * s;
            const labelX = Math.min(this.width - labelWidth / 2 - 6 * s, Math.max(labelWidth / 2 + 6 * s, x));
            ctx.fillStyle = '#722f28'; ctx.fillRect(labelX - labelWidth / 2, y - 82 * s, labelWidth, 20 * s);
            ctx.fillStyle = '#fff1d7'; ctx.fillText(label, labelX, y - 72 * s);
            ctx.restore();
        }
    }
    pause() {} resume() {} applySettings() {
        if (this.environment && this.context) this.environment.reducedMotion = this.context.settings.resolvedReducedMotion();
    }
    async exit() {}
    dispose() { this.hud?.remove(); this.ready?.remove(); this.lessonPanel?.remove(); this.environment?.dispose(); this.attackAvatars?.clear(); this.environment = null; this.hud = null; this.context = null; this.avatar = null; }
}
