import BaseGame from '../../contracts/BaseGame.js';
import { preloadFbxCafeArt } from '../../rendering2d/FbxCafeAssets.js';
import CafeCueAudio from '../../shared/cafe/CafeCueAudio.js';
import CoffeeCrashRenderer from './CoffeeCrashRenderer.js';
import CoffeeCrashModel from './CoffeeCrashModel.js';
import CoffeeCrashStore from './CoffeeCrashStore.js';
import CoffeeCrashUi from './CoffeeCrashUi.js';
import { adjacent } from './CoffeeCrashModel.js';
import { digits } from './CoffeeCrashData.js';

export default class CoffeeCrashGame extends BaseGame {
    constructor() {
        super();
        this.store = new CoffeeCrashStore();
        this.model = new CoffeeCrashModel();
        this.audio = new CafeCueAudio({ match: [430, 650, .12, .06, 'sine'], cascade: [560, 920, .18, .065, 'triangle'],
            miss: [250, 190, .1, .035, 'sine'], win: [520, 1040, .32, .08, 'triangle'] });
        this.frames = [];
        this.wait = 0;
    }
    preload() { return preloadFbxCafeArt(); }
    async enter(context) {
        this.context = context;
        this.renderer = new CoffeeCrashRenderer(context);
        this.ui = new CoffeeCrashUi(context.root, {
            select: index => this.select(index), swap: (a, b) => this.swap(a, b),
            action: action => this.action(action), dialog: action => this.dialogAction(action),
        });
    }
    startSession() {
        this.frames = [];
        this.wait = 0;
        this.finished = false;
        this.ui.block(false);
        this.ui.select(null);
        this.model.reset(this.store.unlocked);
        this.redraw();
        this.openDialog('entry');
    }
    get acceptingInput() {
        return this.context.app.sessionState === 'playing' && !this.ui.dialog.open && !this.ui.blocked && this.model.status === 'playing';
    }
    openDialog(view) {
        this.context.input.setContext('MENU');
        this.audio.stop();
        this.ui.show(view, this.store, this.model.level.id);
    }
    closeDialog() {
        this.ui.close();
        this.context.input.setContext(this.context.app.sessionState === 'playing' ? 'COFFEE_CRASH' : 'PAUSE');
    }
    dialogAction(action) {
        const entry = this.ui.view === 'entry';
        const level = this.ui.level;
        this.closeDialog();
        if (entry && action === 'close') { void this.context.app.exitGame().catch(() => undefined); return; }
        if (!entry) return;
        if (action === 'skip') this.store.hideGuide();
        this.model.reset(level);
        this.audio.unlock();
        this.redraw();
        this.ui.focus(0);
    }
    showGuide() { this.openDialog('help'); }
    select(index) {
        if (!this.acceptingInput) return;
        this.audio.unlock();
        const selected = this.ui.selected;
        if (selected === index) { this.ui.select(null); return; }
        if (selected !== null && adjacent(selected, index)) this.swap(selected, index);
        else this.ui.select(index);
    }
    swap(a, b) {
        if (!this.acceptingInput || !adjacent(a, b)) return;
        this.audio.unlock();
        const result = this.model.swap(a, b);
        this.ui.select(null);
        if (!result.frames.length) return;
        this.frames = result.frames;
        this.wait = 0;
        this.ui.block(true);
        this.ui.say(result.accepted ? 'سفارش در حال آماده شدن…' : 'این جابه‌جایی ترکیبی نمی‌سازد؛ حرکتی کم نشد.');
        if (!result.accepted) this.audio.play('miss');
    }
    action(action) {
        if (!this.acceptingInput) return;
        if (action === 'help') this.openDialog('help');
        if (action === 'hint') this.ui.hint(this.model.findMove());
        if (action === 'undo' && this.model.undo()) {
            this.ui.select(null);
            this.redraw();
            this.ui.say('حرکت قبل برگشت. بازگشت این مرحله استفاده شد.');
        }
    }
    redraw() { this.ui.draw(this.model.frame('settled'), this.model, this.store); }
    fixedUpdate(dt) {
        if (this.context.app.sessionState !== 'playing' || this.ui.dialog.open || !this.ui.blocked) return;
        this.wait -= Math.max(0, dt);
        if (this.wait > 0) return;
        const frame = this.frames.shift();
        if (frame) {
            this.ui.draw(frame, this.model, this.store);
            this.wait = this.ui.motionReduced ? .015 : frame.kind === 'clear' ? .2 : frame.kind === 'swap' ? .18 : .22;
            if (frame.kind === 'clear') this.audio.play(frame.chain > 1 ? 'cascade' : 'match');
            if (frame.kind === 'shuffle') this.ui.say('صفحه برای ادامهٔ سفارش بازچینی شد؛ حرکتی کم نشد.');
            if (frame.kind === 'settled') this.wait = 0;
            return;
        }
        this.ui.block(false);
        this.redraw();
        if (this.model.status !== 'playing') this.finish();
        else if (this.ui.nodes.feedback.textContent === 'سفارش در حال آماده شدن…') this.ui.say('ترکیب بعدی را پیدا کن.');
    }
    render(_alpha, dt) { this.renderer.render(dt); }
    resize() { this.renderer?.resize(); }
    applySettings(settings) {
        this.audio.setEnabled(settings.soundEnabled);
        if (this.ui) this.ui.motionReduced = this.context.root.dataset.motion === 'reduced';
    }
    pause() { this.audio.stop(); this.ui?.pause(); }
    resume() { this.ui?.resume(); }
    finish() {
        if (this.finished) return;
        this.finished = true;
        this.store.record(this.model);
        const won = this.model.status === 'won';
        if (won) this.audio.play('win');
        this.context.app.completeGame({
            title: won ? 'سفارش آماده است!' : 'این نوبت تمام شد',
            subtitle: won ? `${'★'.repeat(this.model.stars)} · مرحلهٔ ${digits.format(this.store.unlocked)} در انتخاب مرحله در دسترس است.` : 'دوباره امتحان کن؛ دنبال ترکیب‌های چهارتایی و پنج‌تایی بگرد.',
            won, score: digits.format(this.model.score),
            stats: { 'مرحله': digits.format(this.model.level.id), 'حرکت باقی‌مانده': digits.format(this.model.moves),
                'بیشترین آبشار': digits.format(this.model.bestChain), 'ستاره': digits.format(this.model.stars) },
        });
    }
    dispose() { this.frames = []; this.ui?.dispose(); this.renderer?.dispose(); this.audio.dispose(); }
}
