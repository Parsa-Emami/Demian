import BaseGame from '../../contracts/BaseGame.js';
import ArcadeMiniGameHud from './ArcadeMiniGameHud.js';
import ArcadeMiniGameRenderer from './ArcadeMiniGameRenderer.js';
import { arcadeMode } from './ArcadeModes.js';
import { arcadeCharacterLabel } from './ArcadeCharacterRoster.js';

function hashSeed(value) {
    const text = String(value ?? 'demian');
    let h = 2166136261;
    for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export default class ArcadeMiniGameBase extends BaseGame {
    constructor(config) {
        super();
        this.config = Object.freeze({ duration: 60, ...config });
        this.mode = arcadeMode(this.config.id);
        this.context = null;
        this.renderer = null;
        this.hud = null;
        this.playerAvatar = null;
        this.player = null;
        this.modeState = {};
        this.session = null;
        this.completed = false;
        this.pixelRatio = 1;
        this.randomFn = Math.random;
    }

    async preload(context) {
        context.eventBus.emit(`${this.config.id}:preload`, { progress: 15 });
        this.playerAvatar = await context.services.characterVisuals.createCanvasAvatar('player', { player: true, variant: 'mobile' });
        context.eventBus.emit(`${this.config.id}:preload`, { progress: 100, slug: this.playerAvatar.slug });
    }

    async enter(context) {
        this.context = context;
        this.renderer = new ArcadeMiniGameRenderer(context, this.config);
        this.player = {
            position: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, forward: { x: 1, z: 0 },
            speed: 0, airborne: false, grounded: true, jumpVelocity: 0, motionState: null,
        };
        this.hud = new ArcadeMiniGameHud({
            root: context.root,
            config: this.config,
            activeSlug: this.playerAvatar.slug,
            onCharacterSelect: (slug) => this.selectCharacter(slug),
        });
        this.hud.mount();
        this.applySettings(context.settings.snapshot());
        this.resize();
    }

    startSession(params = {}) {
        const seed = params.seed ?? `${this.config.id}:${Date.now()}`;
        this.randomFn = mulberry32(hashSeed(seed));
        this.completed = false;
        this.session = {
            seed, elapsed: 0, timeLeft: this.config.duration, score: 0, combo: 1, lives: 3,
            status: this.config.objective ?? 'READY', damageCooldown: 0,
        };
        this.player.motionState = null;
        this.mode.reset(this);
        this.hud?.setPaused(false);
        this.hud?.update(this.session);
        this.context.eventBus.emit(`${this.config.id}:session-started`, { seed, character: this.playerAvatar.slug });
    }

    fixedUpdate(dt, input = {}) {
        if (this.completed || !this.session) return;
        this.session.elapsed += dt;
        this.session.timeLeft = Math.max(0, this.config.duration - this.session.elapsed);
        this.session.damageCooldown = Math.max(0, this.session.damageCooldown - dt);
        this.mode.fixedUpdate(this, dt, input);
        this.playerAvatar?.sync(this.player, dt);
        if (this.session.lives <= 0) this.finish(false, 'OUT OF HP');
        else if (this.session.timeLeft <= 0) this.finish(true, 'TIME UP');
    }

    update() { this.hud?.update(this.session ?? {}); }

    render(_alpha, dt) {
        if (!this.renderer) return;
        const ctx = this.renderer.begin(dt);
        this.mode.draw(this, ctx, this.renderer.camera);
        this.renderer.drawPlayer(ctx, this.playerAvatar, { label: arcadeCharacterLabel(this.playerAvatar?.slug) });
        this.renderer.finish(ctx);
    }

    addScore(value) { if (this.session) this.session.score += Math.max(0, Number(value) || 0); }
    bumpCombo(amount = 1) { if (this.session) this.session.combo = Math.min(12, Math.max(1, this.session.combo + amount)); }
    resetCombo() { if (this.session) this.session.combo = 1; }
    random() { return this.randomFn(); }
    randomRange(min, max) { return Number(min) + (Number(max) - Number(min)) * this.random(); }

    damage(message = 'HIT!') {
        if (!this.session || this.session.damageCooldown > 0) return false;
        this.session.lives = Math.max(0, this.session.lives - 1);
        this.session.damageCooldown = .8;
        this.session.combo = 1;
        this.session.status = message;
        this.context.eventBus.emit(`${this.config.id}:damage`, { lives: this.session.lives });
        globalThis.navigator?.vibrate?.(24);
        return true;
    }

    async selectCharacter(slug) {
        if (!this.context || !slug) return;
        this.context.services.characterVisuals.setActiveSlug(slug);
        const avatar = await this.context.services.characterVisuals.createCanvasAvatar(slug, { player: true, variant: 'mobile' });
        this.playerAvatar = avatar;
        this.playerAvatar.sync(this.player, 0);
        const label = arcadeCharacterLabel(slug);
        this.context.root.querySelectorAll('[data-active-character-name]').forEach((node) => { node.textContent = label; });
        this.context.eventBus.emit('character:selected', { record: { slug, name: label, is_active: true } });
        if (this.session) this.session.status = `${label} READY`;
    }

    finish(won = true, subtitle = 'SESSION COMPLETE') {
        if (this.completed || !this.session) return;
        this.completed = true;
        this.player.motionState = won ? 'win' : 'crouch';
        this.playerAvatar?.sync(this.player, 0.016);
        this.context.app.completeGame({
            title: won ? `${this.config.title} · CLEAR` : `${this.config.title} · GAME OVER`,
            subtitle,
            score: Math.floor(this.session.score),
            won,
            outcome: won ? 'win' : 'loss',
            seed: this.session.seed,
            stats: {
                'کاراکتر': arcadeCharacterLabel(this.playerAvatar?.slug),
                'امتیاز': Math.floor(this.session.score),
                'Combo': `×${this.session.combo}`,
                'HP باقی‌مانده': this.session.lives,
                'زمان': `${Math.floor(this.session.elapsed)}s`,
            },
        });
    }

    applySettings(settings = {}) {
        const max = this.context?.services.performanceProfile.maxPixelRatio ?? 1.5;
        const device = Math.min(window.devicePixelRatio || 1, max);
        const ratios = { performance: Math.min(.85, device), balanced: Math.min(1.05, device), high: device, auto: device };
        this.pixelRatio = ratios[settings.quality] ?? device;
        this.resize();
    }

    resize() { this.renderer?.resize(this.pixelRatio); }
    pause() { this.hud?.setPaused(true); }
    resume() { this.hud?.setPaused(false); }
    async exit() { this.context?.eventBus.emit(`${this.config.id}:exited`); }
    dispose() { this.hud?.dispose(); this.renderer?.dispose(); this.hud = null; this.renderer = null; this.context = null; this.playerAvatar = null; }
}
