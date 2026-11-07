import BaseGame from '../../contracts/BaseGame.js';
import { preloadFbxCafeArt } from '../../rendering2d/FbxCafeAssets.js';
import CafeCueAudio from '../../shared/cafe/CafeCueAudio.js';
import { CRITTERS, TURN_PAGES } from './CafeCrittersData.js';
import CafeCrittersModel from './CafeCrittersModel.js';
import CafeCrittersRenderer from './CafeCrittersRenderer.js';
import CafeCrittersStore from './CafeCrittersStore.js';
import CafeCrittersUi, { critterDigits } from './CafeCrittersUi.js';

const CUES = Object.freeze({
    arrange: [310, 372, .10, .055, 'sine'],
    miss: [292, 204, .19, .065, 'sine'],
    discovery: [440, 820, .36, .095, 'sine'],
    complete: [522, 783, .32, .08, 'triangle'],
});
const progress = new CafeCrittersStore();
let rotation = 0;

export default class CafeCrittersGame extends BaseGame {
    constructor() {
        super();
        this.model = new CafeCrittersModel();
        this.audio = new CafeCueAudio(CUES);
    }

    preload() { return preloadFbxCafeArt(); }

    async enter(context) {
        this.context = context;
        this.renderer = new CafeCrittersRenderer(context);
        this.ui = new CafeCrittersUi(context.root, {
            choose: (field, option) => this.choose(field, option),
            action: (action) => this.handleAction(action),
            dialog: (action) => this.handleDialog(action),
        });
        this.ui.update(this.model);
    }

    startSession() {
        this.model.reset(progress.difficulty, progress.discoveries(), rotation);
        this.ui.update(this.model);
        this.openDialog('entry', { difficulty: progress.difficulty, guide: progress.showGuide });
    }

    openDialog(view, options) {
        this.context.input.setContext('MENU');
        this.context.root.dataset.crittersDialog = view;
        this.audio.stop();
        this.ui.show(view, options);
    }

    closeDialog() {
        this.ui.close();
        delete this.context.root.dataset.crittersDialog;
        const playing = this.context.app.sessionState === 'playing';
        this.context.input.setContext(playing ? this.context.definition.inputContext : 'PAUSE');
    }

    showGuide() {
        if (this.context.app.sessionState === 'paused') this.openDialog('help');
    }

    handleDialog(action) {
        const view = this.ui.view;
        if (!view) return;
        this.closeDialog();
        if (view === 'help') {
            this.context.root.querySelector('[data-screen="pause"] [data-shell-action="game-guide"]')?.focus({ preventScroll: true });
        } else if (view === 'album') {
            this.ui.buttons.album.focus({ preventScroll: true });
        } else if (action === 'cancel') {
            void this.context.app.exitGame().catch(() => undefined);
        } else {
            const difficulty = this.ui.difficulty;
            const known = progress.discoveries();
            progress.saveEntry(difficulty, action === 'skip-guide');
            this.model.reset(difficulty, known, rotation);
            if (known.length === CRITTERS.length) rotation = (rotation + TURN_PAGES) % CRITTERS.length;
            this.model.start();
            this.audio.unlock();
            this.ui.update(this.model);
            this.ui.focusChoice({ resetScroll: true });
        }
    }

    get acceptingInput() {
        return this.context.app.sessionState === 'playing' && !this.ui.dialog.open;
    }

    choose(field, option) {
        if (!this.acceptingInput || !this.model.select(field, option)) return;
        this.audio.play('arrange');
        this.ui.update(this.model);
    }

    handleAction(action) {
        if (!this.acceptingInput) return;
        if (action === 'album') {
            this.openDialog('album', { discovered: this.model.album });
        } else if (action === 'invite') {
            const result = this.model.invite();
            if (!result) return;
            this.audio.unlock();
            if (result.type === 'discovery') {
                progress.record(result.guest.id);
                this.audio.play('discovery');
            } else if (result.type === 'miss') {
                this.audio.play('miss');
            }
            this.ui.update(this.model);
            if (result.type === 'discovery') this.ui.buttons.next.focus({ preventScroll: true });
        } else if (action === 'next' && this.model.next()) {
            if (this.model.status === 'finished') this.finish();
            else {
                this.ui.update(this.model);
                this.ui.focusChoice({ resetScroll: true });
            }
        }
    }

    fixedUpdate(dt) {
        if (!this.acceptingInput || this.model.status !== 'playing') return;
        this.model.advance(dt);
        this.ui.updateTime(this.model.remaining);
        if (this.model.status === 'finished') this.finish();
    }

    render(_alpha, dt) { this.renderer.render(this.model.selection.light, dt); }
    resize() { this.renderer?.resize(); }
    applySettings(settings) { this.audio.setEnabled(settings.soundEnabled); }
    pause() { if (this.model.status !== 'finished') this.audio.stop(); }

    finish() {
        const result = this.model.result();
        const completed = result.discovered === CRITTERS.length;
        const num = (value) => critterDigits.format(value);
        if (result.won) this.audio.play('complete');
        this.ui.update(this.model);
        this.context.app.completeGame({
            title: result.won ? 'دیدارها کامل شد!' : 'نوبت به پایان رسید',
            subtitle: completed ? 'هر هشت صفحهٔ دفترچه باز شده است.'
                : result.newPages ? 'صفحه‌ها و یادگاری‌های تازه در دفترچه ثبت شدند.' : 'دفترچه برای نوبت بعد آماده است.',
            score: `${num(result.found)} / ${num(result.goal)}`,
            won: result.won,
            stats: {
                'درجهٔ سختی': this.model.rules.label,
                'دفترچهٔ مهمان‌ها': `${num(result.discovered)} / ${num(CRITTERS.length)}`,
                'صفحه و یادگاری تازه': num(result.newPages),
                'چیدمان اشتباه': num(result.misses),
            },
        });
    }

    dispose() {
        this.ui?.dispose();
        this.renderer?.dispose();
        this.audio.dispose();
        if (this.context) delete this.context.root.dataset.crittersDialog;
    }
}
