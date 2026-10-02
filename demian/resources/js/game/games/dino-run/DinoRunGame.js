import BaseGame from '../../contracts/BaseGame.js';
import DinoRunModel, { RUNNER_CONFIG } from './DinoRunModel.js';
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
        this.actor = { position: { x: RUNNER_CONFIG.playerX, z: 0 }, forward: { x: 1, z: 0 },
            speed: 0, grounded: true, airborne: false, jumpVelocity: 0, motionState: 'idle' };
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
        this.ready.innerHTML = '<span>یک پرش دیگر…</span><h2>تا کجا می‌توانی بدوی؟</h2><p>از کاکتوس‌ها بپر. برای عبور از پرنده‌ها خم شو.</p><button type="button" data-input-press="jump" data-input-hold="jumpHeld">شروع و پرش <b>↗</b></button><small>نگه‌دار: پرش بلندتر · Space / ↑ · ↓ برای خم‌شدن</small>';
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
        this.actor.motionState = model.duck ? 'crouch' : model.landingTime > 0 ? 'land' : null;
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
        this.context.renderer.resize(1);
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
        const night = Math.floor(this.model.score / 450) % 2 === 1;
        const sky = night ? '#202b32' : '#eee9dc', ink = night ? '#ced8c8' : '#3e5140';
        ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
        // All scenery is original source-drawn Canvas art; no external images or network calls.
        ctx.fillStyle = night ? '#d7ddce' : '#ce9d66';
        ctx.beginPath(); ctx.arc(w * .79, h * .25, 20 * s, 0, Math.PI * 2); ctx.fill();
        if (night) { ctx.fillStyle = sky; ctx.beginPath(); ctx.arc(w * .79 + 8 * s, h * .25 - 4 * s, 18 * s, 0, Math.PI * 2); ctx.fill(); }
        const cloudWidth = 300 * s;
        ctx.fillStyle = night ? '#34434a' : '#faf7ee';
        for (let i = -1; i < w / cloudWidth + 2; i += 1) {
            const x = i * cloudWidth - (distance * s * .12 % cloudWidth);
            const y = h * .27 + (i % 2) * 18 * s;
            ctx.beginPath(); ctx.ellipse(x, y, 35 * s, 9 * s, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = night ? '#30443e' : '#d8ddc8';
        const hillWidth = 230 * s;
        for (let i = -1; i < w / hillWidth + 2; i += 1) {
            const x = i * hillWidth - (distance * s * .22 % hillWidth);
            ctx.beginPath(); ctx.moveTo(x, ground); ctx.lineTo(x + hillWidth * .5, ground - 50 * s);
            ctx.lineTo(x + hillWidth, ground); ctx.fill();
        }
        ctx.fillStyle = night ? '#192720' : '#dce0cb'; ctx.fillRect(0, ground + 1, w, h - ground);
        ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, s); ctx.beginPath(); ctx.moveTo(0, ground); ctx.lineTo(w, ground); ctx.stroke();
        ctx.fillStyle = night ? '#536256' : '#a2ad93';
        for (let i = 0; i < 25; i += 1) {
            const x = ((i * 97 - distance * s) % (w + 90) + w + 90) % (w + 90);
            ctx.fillRect(x, ground + (8 + i % 4 * 7) * s, (i % 3 + 2) * s, s);
        }
        ctx.save(); ctx.translate(0, ground); ctx.scale(s, -s);
        for (const o of frame.obstacles) {
            ctx.fillStyle = ink;
            if (o.type === 'cactus') {
                ctx.fillRect(o.x + o.w * .4, 0, o.w * .3, o.h);
                ctx.fillRect(o.x, o.h * .35, o.w, 7); ctx.fillRect(o.x, o.h * .35, 6, o.h * .4);
                ctx.fillRect(o.x + o.w - 6, o.h * .35, 6, o.h * .27);
            } else {
                const wing = Math.sin(this.model.time * 18) * 9;
                ctx.fillRect(o.x + 8, o.y + 5, 24, 10); ctx.fillRect(o.x + 30, o.y + 10, 10, 7);
                ctx.beginPath(); ctx.moveTo(o.x + 15, o.y + 9); ctx.lineTo(o.x + 9, o.y + 18 + wing);
                ctx.lineTo(o.x + 26, o.y + 9); ctx.fill();
            }
        }
        ctx.restore();
        const avatar = this.avatar, sprite = avatar.atlas.frames[avatar.animator.currentFrameName()];
        if (sprite) {
            const ratio = avatar.atlas.render?.referenceBodyHeightRatio ?? .9;
            const spriteSize = 74 / ratio * s;
            const x = RUNNER_CONFIG.playerX * s, y = ground - frame.y * s;
            ctx.fillStyle = 'rgba(35,48,32,.16)'; ctx.beginPath(); ctx.ellipse(x, ground, 25 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
            ctx.save(); ctx.translate(x, y);
            // Duck lowers the body, without changing the standing/walking/jumping scale.
            if (this.model.duck) ctx.scale(1.18, .55);
            ctx.drawImage(avatar.texture.image, sprite.x, sprite.y, sprite.w, sprite.h,
                -spriteSize * (avatar.atlas.pivot?.x ?? .5), -spriteSize * (avatar.atlas.pivot?.y ?? .965), spriteSize, spriteSize);
            ctx.restore();
        }
        this.context.renderer.present();
    }
    pause() {} resume() {} applySettings() { this.resize(); }
    async exit() {}
    dispose() { this.hud?.remove(); this.ready?.remove(); this.hud = null; this.context = null; this.avatar = null; }
}
