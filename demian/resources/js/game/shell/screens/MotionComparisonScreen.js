import BaseScreen from './BaseScreen.js';
import MasterMotionController from '../../characters/motion/MasterMotionController.js';
import { MASTER_MOTION, MOTION_CHARACTERS, MOTION_SAMPLES, motionCharacter, motionFamily, normalizedPhase } from '../../characters/motion/MasterMotionLibrary.js';
import { drawMasterRig } from '../../characters/motion/MasterMotionRenderer.js';

export default class MotionComparisonScreen extends BaseScreen {
    constructor({ visuals, settings, ...options }) {
        super({ ...options, layer: 'modal' });
        this.visuals = visuals;
        this.settings = settings;
        this.cards = new Map();
        this.generation = 0;
        this.phase = 0;
        this.state = 'run';
        this.speed = 6;
        this.playing = !settings.resolvedReducedMotion();
        this.facing = 1;
        this.lastTime = null;
        this.request = null;
        this.onInput = this.onInput.bind(this);
        this.onClick = this.onClick.bind(this);
        this.tick = this.tick.bind(this);
        this.element.addEventListener('input', this.onInput);
        this.element.addEventListener('click', this.onClick);
        this.element.querySelector('[data-motion-roster]').textContent = MOTION_CHARACTERS.map(entry =>
            `${entry.displayName.split('/')[1].trim()}: ${motionFamily(entry.family).label}${entry.accessories.some(item => item.kind === 'wings') ? ' + بال مستقل' : ''}`).join(' · ');
    }

    async beforeOpen() {
        this.phase = 0;
        this.lastTime = null;
        this.playing = !this.settings.resolvedReducedMotion();
        this.updatePlayButton();
        const host = this.element.querySelector('[data-motion-cards]');
        host.replaceChildren();
        const generation = ++this.generation;
        const options = MOTION_CHARACTERS.map(entry => `<option value="${entry.slug}">${entry.displayName.split('/')[1].trim()}</option>`).join('');
        const assignments = MOTION_SAMPLES.map((slug, index) => {
            const article = document.createElement('article');
            article.className = 'motion-card';
            article.innerHTML = `<header><label for="motion-character-${index}">شخصیت ${index + 1}</label><select id="motion-character-${index}" data-motion-character="${index}">${options}</select></header><p data-motion-family></p><canvas width="560" height="360" aria-label="مقایسهٔ تصویر شخصیت با الگوی مادر"></canvas><div class="motion-card__legend"><span>تصویر فعلی</span><span>الگوی مادر</span></div><p class="motion-card__status" role="status" data-motion-status>در حال آماده‌سازی…</p>`;
            article.querySelector('select').value = slug;
            host.append(article);
            this.cards.set(index, { article, slug, avatar: null, controller: null });
            return this.loadCard(index, slug, generation);
        });
        await Promise.allSettled(assignments);
    }

    async loadCard(index, slug, generation = this.generation) {
        const card = this.cards.get(index);
        if (!card || !motionCharacter(slug)) return;
        const token = Symbol(slug);
        card.token = token;
        card.slug = slug;
        card.avatar = null;
        card.controller = new MasterMotionController(slug);
        card.article.dataset.motionFamily = card.controller.definition.family;
        card.article.querySelector('[data-motion-family]').textContent = motionFamily(card.controller.definition.family).label;
        const status = card.article.querySelector('[data-motion-status]');
        status.textContent = 'در حال بارگذاری تصویر…';
        try {
            const avatar = await this.visuals.createCanvasAvatar(slug, { variant: globalThis.matchMedia?.('(max-width: 650px)').matches ? 'lite' : 'runtime' });
            if (generation !== this.generation || card.token !== token) return;
            card.avatar = avatar;
            status.textContent = card.controller.definition.accessories.some(item => item.kind === 'wings')
                ? 'بدن مشترک؛ بال‌ها با فاز مستقل' : 'هم‌فاز با اعضای خانواده';
            this.render();
        } catch {
            if (generation === this.generation && card.token === token) status.textContent = 'تصویر بارگذاری نشد؛ الگوی مادر قابل بررسی است.';
        }
    }

    async afterOpen() {
        this.request = requestAnimationFrame(this.tick);
    }

    async beforeClose() {
        ++this.generation;
        if (this.request !== null) cancelAnimationFrame(this.request);
        this.request = null;
        this.lastTime = null;
        this.cards.clear();
        this.element.querySelector('[data-motion-cards]').replaceChildren();
    }

    updatePlayButton() {
        const button = this.element.querySelector('[data-motion-toggle]');
        button.textContent = this.playing ? 'توقف حرکت' : 'پخش حرکت';
        button.setAttribute('aria-pressed', String(this.playing));
    }

    onClick(event) {
        if (event.target.closest('[data-motion-toggle]')) {
            this.playing = !this.playing;
            this.lastTime = null;
            this.updatePlayButton();
        }
        if (event.target.closest('[data-motion-step]')) {
            this.playing = false;
            this.phase = normalizedPhase(this.phase + 1 / 48);
            this.updatePlayButton();
            this.render();
        }
        if (event.target.closest('[data-motion-reset]')) {
            this.phase = 0;
            this.lastTime = null;
            this.cards.forEach(card => card.controller?.reset());
            this.render();
        }
        if (event.target.closest('[data-motion-winged]')) {
            const selects = this.element.querySelectorAll('[data-motion-character]');
            const slugs = ['uzudi', 'amirreza', 'darya', 'tiam'];
            selects.forEach((select, index) => { select.value = slugs[index]; this.loadCard(index, slugs[index]); });
        }
    }

    onInput(event) {
        const input = event.target;
        if (input.matches('[data-motion-character]')) this.loadCard(Number(input.dataset.motionCharacter), input.value);
        if (input.matches('[data-motion-state]')) this.state = input.value;
        if (input.matches('[data-motion-speed]')) this.speed = Number(input.value);
        if (input.matches('[data-motion-facing]')) this.facing = Number(input.value);
        if (input.matches('[data-motion-phase]')) {
            this.playing = false;
            this.phase = normalizedPhase(Number(input.value) / 100);
            this.updatePlayButton();
        }
        this.render();
    }

    tick(time) {
        if (!this.active || this.element.hidden) { this.request = null; return; }
        const dt = this.lastTime === null || document.hidden ? 0 : Math.min(.05, Math.max(0, (time - this.lastTime) / 1000));
        this.lastTime = time;
        if (this.playing) {
            const clip = MASTER_MOTION.clips[this.state];
            const frequency = clip?.strideLength ? Math.min(1.55, this.speed / clip.strideLength) : this.state === 'idle' ? 1 / 2.4 : .7;
            this.phase = normalizedPhase(this.phase + frequency * dt);
        }
        this.render(dt);
        this.request = requestAnimationFrame(this.tick);
    }

    render(dt = 0) {
        const phase = this.phase;
        const slider = this.element.querySelector('[data-motion-phase]');
        if (document.activeElement !== slider) slider.value = String(Math.min(99, Math.round(phase * 100)));
        this.element.querySelector('[data-motion-phase-value]').textContent = `${Math.round(phase * 100)}٪`;
        this.element.querySelector('[data-motion-speed-value]').textContent = `${this.speed.toFixed(1)}`;
        this.cards.forEach(card => {
            const ctx = card.article.querySelector('canvas').getContext('2d');
            const pose = card.controller.sync({ state: this.state, phase, progress: phase, facing: this.facing, deltaTime: dt });
            const avatar = card.avatar;
            ctx.clearRect(0, 0, 560, 360);
            ctx.fillStyle = '#111e1b'; ctx.fillRect(0, 0, 560, 360);
            ctx.strokeStyle = '#34443b'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(12, 302); ctx.lineTo(548, 302); ctx.stroke();
            ctx.strokeStyle = '#25392f'; ctx.beginPath(); ctx.moveTo(280, 28); ctx.lineTo(280, 326); ctx.stroke();
            if (avatar) {
                const animator = avatar.animator;
                animator.play(this.state);
                animator.setDirection(this.facing > 0 ? 'e' : 'w');
                animator.setFacing(this.facing);
                if (['walk', 'run', 'sprint', 'idle', 'slide'].includes(this.state)) animator.seekLoop(phase / Math.max(1, animator.animation.cycleCount ?? 1));
                else animator.seek(phase);
                const f = avatar.atlas.frames[animator.currentFrameName()];
                if (f) {
                    const size = 244 / (avatar.atlas.render?.referenceBodyHeightRatio ?? .7);
                    const pivot = avatar.atlas.pivot ?? { x: .5, y: .94 };
                    ctx.imageSmoothingEnabled = true;
                    ctx.drawImage(avatar.texture.image, f.x, f.y, f.w, f.h, 141 - size * pivot.x, 302 - size * pivot.y, size, size);
                }
            }
            drawMasterRig(ctx, pose, { x: 418, ground: 302, scale: 274,
                color: card.controller.definition.family === 'female-base-v1' ? '#d7e5ab' : '#a5d8de', attachments: card.controller.attachments });
        });
    }

    dispose() {
        this.beforeClose();
        this.element.removeEventListener('input', this.onInput);
        this.element.removeEventListener('click', this.onClick);
        super.dispose();
    }
}
