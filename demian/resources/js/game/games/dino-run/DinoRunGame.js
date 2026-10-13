import BaseGame from '../../contracts/BaseGame.js';
import DinoRunModel, { RUNNER_CONFIG } from './DinoRunModel.js';
import DinoRunEnvironment from './DinoRunEnvironment.js';
import { BUILTIN_CHARACTER_SLUGS, builtinCharacterAssetPair } from '../../characters/CharacterVisualContract.js';
import { arcadeCharacterLabel } from '../arcade/ArcadeCharacterRoster.js';
import { UI_LAYER, assignUiLayer } from '../../ui/UiLayer.js';

const BEST_KEY = 'demian.dino-run.best.v1';
function readBest() { try { return Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0); } catch { return 0; } }
function saveBest(value) { try { localStorage.setItem(BEST_KEY, String(value)); } catch {} }

/** Uses the existing application lifecycle, input routing, sprite service and result screen. */
export default class DinoRunGame extends BaseGame {
    constructor() { super(); this.model = new DinoRunModel(); this.best = readBest(); this.finished = false; this.uiTime = 0; }
    async preload(context) {
        this.avatar = await context.services.characterVisuals.createCanvasAvatar('player', { player: true });
    }
    async enter(context) {
        this.context = context;
        this.environment = new DinoRunEnvironment(context.services.performanceProfile);
        this.actor = { position: { x: RUNNER_CONFIG.playerX, z: 0 }, forward: { x: 1, z: 0 },
            speed: 0, grounded: true, airborne: false, jumpVelocity: 0,
            jumpForce: RUNNER_CONFIG.jumpSpeed / 100, motionState: 'idle' };
        // Same sidebar works in both games; selection loads before committing the change.
        this.characterManager = { characters: [], activeRecord: null,
            select: (id) => this.selectCharacter(id), activate: (id) => this.selectCharacter(id) };
        this.refreshRoster();
        this.hud = assignUiLayer(document.createElement('section'), UI_LAYER.LOCAL_BASE);
        this.hud.className = 'runner-hud'; this.hud.dir = 'rtl';
        this.hud.innerHTML = '<div class="runner-hud__title"><small>DEMIAN / 01</small><strong>DINO RUN</strong></div><div class="runner-hud__score"><span><small>امتیاز</small><b data-run-score>00000</b></span><span><small>رکورد</small><b data-run-best>00000</b></span></div>';
        context.root.querySelector('[data-game-hud-host]')?.append(this.hud);
        this.ready = assignUiLayer(document.createElement('div'), UI_LAYER.LOCAL_BASE);
        this.ready.className = 'runner-ready'; this.ready.dir = 'rtl';
        this.ready.innerHTML = '<span>یک پرش دیگر…</span><h2>تا کجا می‌توانی بدوی؟</h2><p>از کاکتوس‌ها بپر. برای عبور از پرنده‌ها اسلاید برو.</p><button type="button" data-input-press="jump" data-input-hold="jumpHeld">شروع و پرش <b>↗</b></button><small>نگه‌دار: پرش بلندتر · Space / ↑ · ↓ برای اسلاید</small>';
        context.root.querySelector('[data-game-hud-host]')?.append(this.ready);
        this.scoreNode = this.hud.querySelector('[data-run-score]'); this.bestNode = this.hud.querySelector('[data-run-best]');
        this.resize();
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
        } finally { this.selecting = false; }
    }
    startSession({ seed = Date.now() } = {}) {
        this.model.reset({ seed, width: this.trackWidth }); this.finished = false;
        this.ready.hidden = false; this.updateHud();
    }
    fixedUpdate(dt, input = {}) {
        if (!this.context || this.context.app.sessionState !== 'playing' || this.context.root.dataset.sidebarState === 'expanded' || this.finished) return;
        this.model.step(dt, input);
        const model = this.model;
        this.actor.speed = model.status === 'ready' ? 0 : 6;
        this.actor.airborne = model.y > 0; this.actor.grounded = !this.actor.airborne;
        this.actor.jumpVelocity = model.vy / 100;
        this.actor.motionState = model.duck ? 'slide' : model.landingTime > 0 ? 'land' : null;
        this.avatar.sync(this.actor, dt);
        if (model.status === 'over') this.finish();
    }
    update(dt = 0) {
        this.uiTime += dt;
        if (this.uiTime >= .1) { this.uiTime = 0; this.updateHud(); }
    }
    updateHud() {
        if (!this.hud) return;
        this.scoreNode.textContent = String(this.model.score).padStart(5, '0');
        this.bestNode.textContent = String(Math.max(this.best, this.model.score)).padStart(5, '0');
        this.ready.hidden = this.model.status !== 'ready';
    }
    finish() {
        if (this.finished) return;
        this.finished = true;
        const previousBest = this.best; this.best = Math.max(this.best, this.model.score); saveBest(this.best);
        this.context.app.completeGame({ title: this.model.score > previousBest ? 'رکورد تازه!' : 'یک بار دیگر؟',
            subtitle: 'هر پرش، یک قدم نزدیک‌تر به رکورد بعدی.', score: this.model.score, won: false,
            stats: { 'رکورد': this.best, 'موانع ردشده': this.model.passed, 'زمان': `${Math.floor(this.model.time)} ثانیه`,
                'کاراکتر': arcadeCharacterLabel(this.avatar.slug) } });
    }
    resize() {
        if (!this.context) return;
        const ratio = this.context.services.performanceProfile?.maxPixelRatio ?? 1.35;
        this.context.renderer.setPresentationMode('smooth', { maxPixelRatio: ratio });
        this.context.renderer.resize(ratio);
        const { width, height } = this.context.renderer.logicalDimensions();
        this.width = width; this.height = height;
        this.scale = Math.min(height / 430, width / 420);
        this.trackWidth = width / this.scale; this.model.setWidth(this.trackWidth);
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
        this.environment.drawDust(ctx, { x: RUNNER_CONFIG.playerX * s, ground, scale: s, time: this.model.time,
            sliding: this.model.duck, running: this.model.status === 'running' && this.model.y === 0 });
        const avatar = this.avatar, sprite = avatar.atlas.frames[avatar.animator.currentFrameName()];
        if (sprite) {
            const ratio = avatar.atlas.render?.referenceBodyHeightRatio ?? .9;
            const spriteSize = RUNNER_CONFIG.bodyHeight / ratio * s;
            const x = RUNNER_CONFIG.playerX * s, y = ground - frame.y * s;
            ctx.fillStyle = 'rgba(35,48,32,.16)'; ctx.beginPath(); ctx.ellipse(x, ground, 25 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
            ctx.save(); ctx.translate(x, y);
            // Sliding is a real low pose in the atlas. Keep face/body proportions at one uniform scale.
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(avatar.texture.image, sprite.x, sprite.y, sprite.w, sprite.h,
                -spriteSize * (avatar.atlas.pivot?.x ?? .5), -spriteSize * (avatar.atlas.pivot?.y ?? .965), spriteSize, spriteSize);
            ctx.restore();
        }
        this.context.renderer.present();
    }
    pause() {} resume() {} applySettings() { this.resize(); }
    async exit() {}
    dispose() { this.hud?.remove(); this.ready?.remove(); this.environment?.dispose(); this.environment = null; this.hud = null; this.context = null; this.avatar = null; }
}
