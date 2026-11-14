import BaseGame from '../../contracts/BaseGame.js';
import { preloadFbxCafeArt } from '../../rendering2d/FbxCafeAssets.js';
import CafeCueAudio from '../../shared/cafe/CafeCueAudio.js';
import AfterHoursModel from './AfterHoursModel.js';
import RankedRouteChallenge from '../../leaderboard/RankedRouteChallenge.js';
import AfterHoursRenderer from './AfterHoursRenderer.js';
import AfterHoursUi, { shiftTime } from './AfterHoursUi.js';
import { CIRCUITS, SHIFT_LAYOUTS, SHIFT_RULES, distance } from './AfterHoursMap.js';

const AFTER_HOURS_CUES = Object.freeze({
    walk: [108, 62, .085, .036, 'triangle'],
    sprint: [166, 62, .12, .075, 'triangle'],
    shadow: [91, 43, .18, .085, 'triangle'],
    metal: [684, 95, .35, .15, 'triangle'],
    power: [207, 377, .15, .092, 'sine'],
    card: [436, 668, .17, .105, 'sine'],
    chase: [187, 54, .48, .18, 'triangle'],
    escaped: [358, 716, .43, .125, 'sine'],
    caught: [154, 42, .4, .155, 'triangle'],
    timeout: [173, 68, .3, .1, 'sine'],
    'last-minute': [282, 180, .22, .11, 'sine'],
});

const STORAGE = 'demian.after-hours.v1.';
const INTRO = 'دو کارت در پیشخوان و انبار جا مانده. تابلوهای برق را کنار ورودی و راهرو پیدا کن.';
const MESSAGES = Object.freeze({
    card: 'یک کارت ثبت شد. حواست به صدای قدم‌ها باشد.',
    relic: 'محفظه باز شد. یادگار را با خودت از کافه بیرون ببر.',
    'locker-off': 'محفظه برق ندارد. از تابلوی راهرو، برق انبار را وصل کن.',
    investigate: 'سایه صدا را شنیده و دارد بررسی می‌کند.',
    chase: 'سایه پیدایت کرد. مسیر را عوض کن و بین خودت و او مانع بگذار.',
    'last-minute': 'یک دقیقه مانده. مسیر خروج و برق آن را چک کن.',
});
const OUTCOMES = Object.freeze({
    escaped: ['شیفت به پایان رسید', 'با دو کارت از کافه بیرون آمدی.'],
    caught: ['سایه به تو رسید', 'از مسیر روشن استفاده کن و نزدیک سایه آهسته‌تر حرکت کن.'],
    timeout: ['وقت شیفت تمام شد', 'برای برگشت، یکی از تابلوهای مسیر را به خاطر بسپار.'],
});

let nextLayout = Math.floor(Math.random() * SHIFT_LAYOUTS.length);

function read(key) {
    try { return localStorage.getItem(STORAGE + key); } catch { return null; }
}

function write(key, value) {
    try { localStorage.setItem(STORAGE + key, value); } catch {}
}

function bestFor(difficulty) {
    try {
        const record = JSON.parse(read(`best.${difficulty}`));
        if (record && Number.isSafeInteger(record.score) && record.score >= 1000 && record.score <= 2000) {
            return { score: record.score, relic: record.relic === true };
        }
    } catch {}
    return { score: 0, relic: false };
}

export default class AfterHoursGame extends BaseGame {
    constructor() {
        super();
        this.model = new AfterHoursModel();
        this.audio = new CafeCueAudio(AFTER_HOURS_CUES);
        this.radio = INTRO;
    }

    async preload(context) {
        void preloadFbxCafeArt();
        this.avatar = await context.services.characterVisuals.createCanvasAvatar('darya', { player: true });
    }

    async enter(context) {
        this.context = context;
        this.renderer = new AfterHoursRenderer(context);
        this.ui = new AfterHoursUi(context.root, (action, value) => this.handleDialog(action, value));
        this.routeChallenge = new RankedRouteChallenge({
            context, gameId: 'after-hours',
            position: () => this.model.player.position,
            onStart: async (run) => {
                this.model.reset('standard', run.seed % SHIFT_LAYOUTS.length);
                this.model.start();
                if (this.ui.dialog.open) this.closeDialog();
                this.avatar.sync(this.model.player, 0);
                this.renderer.scene.camera.jumpTo(this.model.player.position);
                this.ui.update(this.model, this.radio);
            },
        });
        this.routeChallenge.mount();
        this.avatar.sync(this.model.player);
        this.resize();
    }

    startSession() {
        const previous = read('difficulty');
        const difficulty = Object.hasOwn(SHIFT_RULES, previous) ? previous : 'standard';
        this.model.reset(difficulty, nextLayout);
        nextLayout = (nextLayout + 1) % SHIFT_LAYOUTS.length;
        this.shadowSteps = 0;
        this.radio = INTRO;
        this.avatar.sync(this.model.player);
        this.renderer.scene.camera.jumpTo(this.model.player.position);
        this.openDialog('entry', { guide: read('guide') !== 'hidden', difficulty });
        this.ui.update(this.model, this.radio);
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
        const focusTarget = playing ? '.play-toolbar [data-shell-action="pause"]'
            : '[data-screen="pause"] [data-shell-action="game-guide"]';
        this.context.root.querySelector(focusTarget)?.focus({ preventScroll: true });
    }

    showGuide() {
        if (this.context.app.sessionState === 'paused') this.openDialog('help');
    }

    handleDialog(action, value) {
        const view = this.ui.view;
        if (!view) return;
        if (action === 'cancel') {
            this.closeDialog();
            if (view === 'entry') void this.context.app.exitGame().catch(() => undefined);
            return;
        }
        if (view === 'power' && action === 'power') {
            this.model.switchPower(value);
            this.closeDialog();
            this.audio.unlock();
            this.consumeEvents();
            this.ui.update(this.model, this.radio);
        } else if (view === 'help' && action === 'confirm') {
            this.closeDialog();
        } else if (view === 'entry' && (action === 'confirm' || action === 'skip-guide')) {
            const difficulty = this.ui.difficulty;
            if (action === 'skip-guide') write('guide', 'hidden');
            write('difficulty', difficulty);
            this.model.reset(difficulty, this.model.layout);
            this.closeDialog();
            this.audio.unlock();
            this.model.start();
            this.ui.update(this.model, this.radio);
        }
    }

    fixedUpdate(dt, input) {
        if (this.model.status !== 'running' || this.ui.dialog.open) return;
        if (input.interact && this.model.interact()?.kind === 'panel') {
            this.openDialog('power', { darkCircuit: this.model.darkCircuit });
            return;
        }
        this.model.advance(dt, input);
        this.routeChallenge?.tick(dt);
        this.avatar.sync(this.model.player, dt);
        const shadow = this.model.shadow;
        this.shadowSteps += distance(shadow.previous, shadow.position);
        if (this.shadowSteps >= 2.55) {
            this.shadowSteps = 0;
            if (distance(shadow.position, this.model.player.position) < 24) {
                this.audio.play('shadow', shadow.position, this.model.player.position);
            }
        }
        this.consumeEvents();
        if (this.model.status !== 'running') this.finish();
    }

    consumeEvents() {
        for (const event of this.model.drainEvents()) {
            if (event.type === 'card') this.routeChallenge?.checkpoint(event.point?.id);
            if (event.type === 'escaped') this.routeChallenge?.checkpoint('exit');
            this.audio.play(event.type, event.point, this.model.player.position);
            if (event.type === 'power') {
                const dark = CIRCUITS.find((circuit) => circuit.id === this.model.darkCircuit);
                this.radio = `مدار «${dark.label}» خاموش شد. دو مدار دیگر برق دارند.`;
            } else if (event.type === 'exit-locked') {
                this.radio = this.model.cardCount < 2
                    ? 'در خروج با هر دو کارت شیفت باز می‌شود.'
                    : 'خروجی بی‌برق است. از تابلوی نزدیک ورودی برق را وصل کن.';
            } else if (event.type === 'card' && this.model.cardCount === 2) {
                this.radio = 'هر دو کارت پیدا شد. برق خروجی را چک کن و به در خروج برگرد.';
            } else if (MESSAGES[event.type]) {
                this.radio = MESSAGES[event.type];
            }
        }
    }

    update(dt) {
        this.uiElapsed = (this.uiElapsed ?? 0) + dt;
        if (this.uiElapsed >= .1) {
            this.uiElapsed = 0;
            this.ui.update(this.model, this.radio);
        }
    }

    render(alpha, dt) { this.renderer.render(this.model, this.avatar, alpha, dt); }
    resize({ reframe = true } = {}) { this.renderer?.resize(reframe ? this.model.player.position : null); }
    applySettings(settings) { this.audio.setEnabled(settings.soundEnabled); }
    pause() { if (this.model.status === 'running') this.audio.stop(); }

    finish() {
        const result = this.model.result();
        const difficulty = this.model.difficulty;
        const best = bestFor(difficulty);
        if (result.won) {
            best.score = Math.max(best.score, result.score);
            best.relic ||= result.securedRelic;
            write(`best.${difficulty}`, JSON.stringify(best));
        }
        const [title, subtitle] = OUTCOMES[result.reason];
        this.ui.update(this.model, this.radio);
        this.context.app.completeGame({
            title, subtitle, score: result.score, won: result.won,
            stats: {
                'درجهٔ سختی': this.model.rules.label,
                'زمان سپری‌شده': shiftTime(result.elapsed),
                'کارت‌های شیفت': `${result.cards} / ۲`,
                'یادگار این شیفت': result.securedRelic ? 'ثبت شد' : 'ثبت نشد',
                'بهترین خروج این درجه': best.score || 'اولین خروج در انتظار توست',
                'یادگار ثبت‌شدهٔ این درجه': best.relic ? 'به‌دست آمده' : 'در محفظهٔ کافه',
            },
        });
    }

    dispose() {
        this.routeChallenge?.stop();
        this.ui?.dispose();
        this.audio.dispose();
        this.renderer?.dispose();
        this.model.dispose();
        if (this.context) delete this.context.root.dataset.shiftDialog;
    }
}
