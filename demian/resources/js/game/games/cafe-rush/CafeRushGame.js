import BaseGame from '../../contracts/BaseGame.js';
import { preloadFbxCafeArt } from '../../rendering2d/FbxCafeAssets.js';
import CafeCueAudio from '../../shared/cafe/CafeCueAudio.js';
import CafeRushModel from './CafeRushModel.js';
import RankedGameplayChallenge from '../../leaderboard/RankedGameplayChallenge.js';
import CafeRushRenderer from './CafeRushRenderer.js';
import CafeRushUi, { rushDigits } from './CafeRushUi.js';
import { RECIPES, RUSH_GUESTS, RUSH_RULES, VIP_AT } from './CafeRushMap.js';

const STORAGE = 'demian.cafe-rush.v1.';
const INTRO = 'برگهٔ سفارش را از پیشخوان بردار. ایستگاه بعدی روی نقشه مشخص می‌شود.';
const CUES = Object.freeze({
    arrival: [526, 659, .12, .065, 'sine'],
    vip: [440, 880, .37, .13, 'sine'],
    preparing: [181, 247, .18, .08, 'triangle'],
    ready: [523, 784, .2, .09, 'sine'],
    pickup: [248, 391, .12, .08, 'triangle'],
    served: [453, 780, .25, .12, 'sine'],
    expired: [276, 142, .2, .08, 'triangle'],
    'wrong-table': [176, 82, .24, .11, 'triangle'],
    spill: [390, 70, .29, .14, 'triangle'],
    finished: [391, 583, .34, .10, 'sine'],
});

const standing = (position) => ({ position, forward: { x: 0, z: 1 }, speed: 0, motionState: 'idle', grounded: true });
const STAFF = Object.fromEntries(Object.entries(RUSH_GUESTS).map(([id, position]) => [id, standing(position)]));

let variation = Math.floor(Math.random() * 3);

function read(key) {
    try { return localStorage.getItem(STORAGE + key); } catch { return null; }
}

function write(key, value) {
    try { localStorage.setItem(STORAGE + key, String(value)); } catch {}
}

function noticeFor(event) {
    const order = event.order;
    const recipe = order ? RECIPES[order.recipe] : null;
    const table = order ? rushDigits.format(order.table) : '';
    switch (event.type) {
        case 'arrival': return `سفارش تازه · ${recipe.name} برای میز ${table}`;
        case 'vip': return 'اوزودی رسید. برگهٔ ویژه دو نوشیدنی دارد و ۷۵ امتیاز اضافه می‌دهد.';
        case 'accepted': return `${recipe.name} · برو به ${recipe.station === 'bar' ? 'بار نوشیدنی' : 'میز شیرینی'}.`;
        case 'preparing': return `${recipe.name} در حال آماده‌شدن است.`;
        case 'ready': return `${recipe.name} آماده است. از همان ایستگاه بردار.`;
        case 'pickup': return `سینی را به میز ${table} ببر. پیش از پیچ سرعتت را کم کن.`;
        case 'served': return `تحویل شد · ${rushDigits.format(event.points)} امتیاز${event.bonus ? ' با پاداش زنجیره' : ''}`;
        case 'expired': return `وقت سفارش میز ${table} تمام شد. زنجیره از صفر شروع می‌شود.`;
        case 'wrong-table': return `این سینی برای میز ${table} است. به میز درست برو.`;
        case 'spill': return 'سینی ریخت. سفارش را دوباره آماده کن و از کف لغزنده فاصله بگیر.';
        case 'tray-full': return `اول سینی را به میز ${table} برسان.`;
        case 'empty-tray': return 'برای سرو، ابتدا از ایستگاه سینی را بردار.';
        case 'no-tickets': return 'سفارش تازه در راه است. ایستگاه‌ها را به خاطر بسپار.';
        case 'check-ticket': return order ? `ایستگاه ${recipe.name} روی نقشه مشخص است.` : INTRO;
        default: return '';
    }
}

export default class CafeRushGame extends BaseGame {
    constructor() {
        super();
        this.model = new CafeRushModel();
        this.audio = new CafeCueAudio(CUES);
        this.notice = INTRO;
    }

    async preload(context) {
        void preloadFbxCafeArt();
        const visuals = context.services.characterVisuals;
        const [player, setayesh, uzudi] = await Promise.all([
            visuals.createCanvasAvatar('amirreza', { player: true }),
            visuals.createCanvasAvatar('setayesh'),
            visuals.createCanvasAvatar('uzudi'),
        ]);
        this.avatars = { player, setayesh, uzudi };
    }

    async enter(context) {
        this.context = context;
        this.renderer = new CafeRushRenderer(context);
        this.ui = new CafeRushUi(context.root, (action) => this.handleDialog(action));
        this.gameplayChallenge = new RankedGameplayChallenge({
            context, gameId: 'cafe-rush',
            onStart: async run => {
                this.model.reset('standard', run.seed % 3);
                this.model.start();
                if (this.ui.dialog.open) this.closeDialog();
                this.notice = INTRO;
                this.syncAvatars(0);
                this.ui.update(this.model, this.notice);
            },
        });
        this.gameplayChallenge.mount();
        this.syncAvatars(0);
        this.resize();
    }

    syncAvatars(dt) {
        this.avatars.player.sync(this.model.player, dt);
        this.avatars.setayesh.sync(STAFF.setayesh, dt);
        if (dt === 0 || this.model.elapsed >= VIP_AT) this.avatars.uzudi.sync(STAFF.uzudi, dt);
    }

    startSession() {
        const saved = read('difficulty');
        const difficulty = Object.hasOwn(RUSH_RULES, saved) ? saved : 'standard';
        this.model.reset(difficulty, variation);
        variation = (variation + 1) % 3;
        this.notice = INTRO;
        this.noticeUntil = 0;
        this.uiElapsed = 0;
        this.cue = null;
        this.syncAvatars(0);
        this.openDialog('entry', { difficulty, guide: read('guide') !== 'hidden' });
        this.ui.update(this.model, this.notice);
    }

    openDialog(view, options) {
        this.context.input.setContext('MENU');
        this.context.root.dataset.shiftDialog = view;
        this.ui.show(view, options);
        this.audio.stop();
    }

    closeDialog() {
        this.ui.close();
        delete this.context.root.dataset.shiftDialog;
        const playing = this.context.app.sessionState === 'playing';
        this.context.input.setContext(playing ? this.context.definition.inputContext : 'PAUSE');
        const focus = playing ? '.play-toolbar [data-shell-action="pause"]' : '[data-screen="pause"] [data-shell-action="game-guide"]';
        this.context.root.querySelector(focus)?.focus({ preventScroll: true });
    }

    showGuide() {
        if (this.context.app.sessionState === 'paused') this.openDialog('help');
    }

    handleDialog(action) {
        const view = this.ui.view;
        if (!view) return;
        if (action === 'cancel') {
            this.closeDialog();
            if (view === 'entry') void this.context.app.exitGame().catch(() => undefined);
        } else if (view === 'help') {
            this.closeDialog();
        } else {
            const difficulty = this.ui.difficulty;
            if (action === 'skip-guide') write('guide', 'hidden');
            write('difficulty', difficulty);
            this.model.reset(difficulty, this.model.variation);
            this.closeDialog();
            this.audio.unlock();
            this.model.start();
            this.consumeEvents();
            this.ui.update(this.model, this.notice);
        }
    }

    fixedUpdate(dt, input) {
        if (this.ui.dialog.open || this.model.status !== 'running') return;
        const controls = this.gameplayChallenge?.prepareInput(input) ?? input;
        this.model.advance(dt, controls);
        this.gameplayChallenge?.tick(controls);
        this.syncAvatars(dt);
        this.consumeEvents();
        if (this.model.status === 'finished') {
            void this.gameplayChallenge?.finish(this.model.result().won);
            this.finish();
        }
    }

    consumeEvents() {
        for (const event of this.model.drainEvents()) {
            this.audio.play(event.type, event.point, this.model.player.position);
            const label = noticeFor(event);
            if (label && (event.type !== 'arrival' || this.model.elapsed >= this.noticeUntil)) {
                this.notice = label;
                this.noticeUntil = this.model.elapsed + 2.6;
            }
            if (event.point && ['served', 'spill', 'wrong-table'].includes(event.type)) {
                this.cue = { ...event, time: this.model.elapsed };
            }
        }
    }

    update(dt) {
        this.uiElapsed = (this.uiElapsed ?? 0) + dt;
        if (this.uiElapsed >= .095) {
            this.uiElapsed = 0;
            this.ui.update(this.model, this.notice);
        }
    }

    render(alpha, dt) { this.renderer.render(this.model, this.avatars, this.cue, alpha, dt); }
    resize() { this.renderer?.resize(); }
    applySettings(settings) { this.audio.setEnabled(settings.soundEnabled); }
    pause() { if (this.model.status === 'running') this.audio.stop(); }

    finish() {
        const result = this.model.result();
        const key = `best.${this.model.difficulty}`;
        const saved = Number(read(key));
        const previous = Number.isSafeInteger(saved) && saved > 0 ? saved : 0;
        const best = Math.max(previous, result.score);
        if (best > previous) write(key, best);
        this.ui.update(this.model, this.notice);
        this.context.app.completeGame({
            title: result.won ? 'شیفت موفق بود!' : 'شیفت به پایان رسید',
            subtitle: result.won ? 'سهمیهٔ تحویل را پر کردی.' : 'برای رسیدن به سهمیه، مسیر سینی و زمان سفارش‌ها را دوباره تمرین کن.',
            score: rushDigits.format(result.score), won: result.won,
            stats: {
                'درجهٔ سختی': this.model.rules.label,
                'تحویل / هدف': `${rushDigits.format(result.delivered)} / ${rushDigits.format(result.quota)}`,
                'بهترین زنجیره': rushDigits.format(result.bestCombo),
                'سفارش ویژهٔ اوزودی': result.vipServed ? 'تحویل شد' : 'باقی ماند',
                'ریختن سینی / سفارش منقضی': `${rushDigits.format(result.spills)} / ${rushDigits.format(result.expired)}`,
                'بهترین امتیاز این درجه': rushDigits.format(best),
            },
        });
    }

    dispose() {
        this.gameplayChallenge?.stop();
        this.ui?.dispose();
        this.audio.dispose();
        this.renderer?.dispose();
        this.model.dispose();
        if (this.context) delete this.context.root.dataset.shiftDialog;
    }
}
