import { weeklyIndex, WEEKLY_VERSIONS } from '../../content/WeeklyContent.js';
import BaseGame from '../../contracts/BaseGame.js';
import { preloadFbxCafeArt } from '../../rendering2d/FbxCafeAssets.js';
import CafeCueAudio from '../../shared/cafe/CafeCueAudio.js';
import { CRITTERS, weeklyCritters } from './CafeCrittersData.js';
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
const rotation = 0;

export default class CafeCrittersGame extends BaseGame {
    constructor() {
        super();
        this.model = new CafeCrittersModel();
        this.audio = new CafeCueAudio(CUES);
        this.rankRun = null;
        this.rankActions = [];
        this.rankTicks = 0;
        this.sessionNonce = 0;
    }

    preload() { void preloadFbxCafeArt(); }

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
        this.sessionNonce++;
        this.rankRun = null;
        this.rankActions = [];
        this.rankTicks = 0;
        this.model.reset(progress.difficulty, progress.discoveries(), rotation, weeklyCritters(weeklyIndex()));
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
        // Only explicit controls may start a turn. A stale/unknown dialog
        // action must never dismiss the entry gate or trigger a ranked run.
        if (view === 'entry' && !['confirm', 'skip-guide', 'cancel'].includes(action)) return;
        if (view !== 'entry' && !['confirm', 'cancel'].includes(action)) return;
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
            this.audio.unlock();
            void this.beginRound(difficulty, known);
        }
    }

    async beginRound(difficulty, known) {
        const nonce = ++this.sessionNonce;
        const leaderboard = this.context?.services?.leaderboards;
        // Server replay v1 uses standard difficulty and server-chosen rotation;
        // other difficulties remain untouched practice modes.
        // Treat online unavailability or a malformed session as practice,
        // never as an authoritative ranked attempt. Do not strand the game
        // behind a closed entry dialog when the API rejects or times out.
        let run = { mode: 'practice' };
        try {
            if (difficulty === 'standard' && leaderboard) {
                const proposed = await leaderboard.startTurnRun('cafe-critters');
                if (proposed?.mode === 'ranked'
                    && proposed.game_id === 'cafe-critters'
                    && (proposed.rules_version === 'cafe-critters-replay-v1'
                        || (proposed.rules_version === WEEKLY_VERSIONS['cafe-critters']
                            && Number.isSafeInteger(proposed.content_week) && proposed.content_week >= 0))
                    && Number.isSafeInteger(proposed.seed) && proposed.seed > 0
                    && /^[0-9a-f-]{36}$/i.test(String(proposed.run_id ?? ''))) {
                    run = proposed;
                }
            }
        } catch {
            // Offline play keeps its own local progress, never submits a
            // client-owned score, and never fabricates a server seed.
        }
        if (!this.context || nonce !== this.sessionNonce) return;
        this.rankRun = run;
        this.rankActions = [];
        this.rankTicks = 0;
        if (run.mode === 'ranked') {
            // In the original model, a fully discovered album uses the provided
            // deterministic rotation rather than the local unseen guest order.
            this.model.reset('standard', CRITTERS.map(guest => guest.id),
                run.seed % CRITTERS.length, run.rules_version === WEEKLY_VERSIONS['cafe-critters'] ? weeklyCritters(run.content_week) : null);
            this.context.app.shell.toast('این دور با بازپخش سروری امتیازدهی می‌شود.', 'info');
        } else {
            this.model.reset(difficulty, known, rotation, weeklyCritters(weeklyIndex()));
        }
        this.model.start();
        this.ui.update(this.model);
        this.ui.focusChoice({ resetScroll: true });
    }

    recordRankedAction(kind, extra = {}) {
        if (this.rankRun?.mode !== 'ranked') return;
        const lastTick = this.rankActions.at(-1)?.tick ?? -1;
        const tick = Math.max(this.rankTicks, lastTick + 1);
        if (tick >= 240 * 60 || this.rankActions.length >= 240) {
            // The round may still complete as local practice, but cannot
            // publish a truncated replay or an unbounded event stream.
            this.rankRun = { mode: 'practice' };
            return;
        }
        this.rankActions.push({ tick, kind, ...extra });
    }

    get acceptingInput() {
        return this.context.app.sessionState === 'playing' && !this.ui.dialog.open;
    }

    choose(field, option) {
        if (!this.acceptingInput || !this.model.select(field, option)) return;
        this.recordRankedAction('select', { field, option });
        this.audio.play('arrange');
        this.context.eventBus.emit('feedback:cue', { gameId: 'cafe-critters', kind: 'arrange' });
        this.ui.update(this.model);
    }

    handleAction(action) {
        if (!this.acceptingInput) return;
        if (action === 'album') {
            this.openDialog('album', { discovered: this.model.album });
        } else if (action === 'invite') {
            const result = this.model.invite();
            if (!result) return;
            this.recordRankedAction('invite');
            this.audio.unlock();
            if (result.type === 'discovery') {
                progress.record(result.guest.id);
                this.audio.play('discovery');
                this.context.eventBus.emit('feedback:cue', { gameId: 'cafe-critters', kind: 'discovery' });
            } else if (result.type === 'miss') {
                this.audio.play('miss');
                this.context.eventBus.emit('feedback:cue', { gameId: 'cafe-critters', kind: 'miss' });
            }
            this.ui.update(this.model);
            if (result.type === 'discovery') this.ui.buttons.next.focus({ preventScroll: true });
        } else if (action === 'next' && this.model.next()) {
            this.recordRankedAction('next');
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
        if (this.rankRun?.mode === 'ranked') this.rankTicks++;
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
            deviceRecord: result.won ? { ticks: Math.max(1, Math.round(this.model.playedSeconds * 60)) } : null,
            resultMetric: { ticks: Math.round(this.model.playedSeconds * 60) },
            resultMetricLabel: result.won ? 'زمان حل سرنخ‌ها' : 'زمان سپری‌شده',
            ranking: result.won && this.rankRun?.mode === 'ranked'
                ? this.context.services.leaderboards.finishTurnRun(this.rankRun,
                    this.rankActions, (this.rankActions.at(-1)?.tick ?? 0) + 1)
                : { status: 'practice' },
            stats: {
                'درجهٔ سختی': this.model.rules.label,
                'دفترچهٔ مهمان‌ها': `${num(result.discovered)} / ${num(CRITTERS.length)}`,
                'صفحه و یادگاری تازه': num(result.newPages),
                'چیدمان اشتباه': num(result.misses),
            },
        });
    }

    dispose() {
        this.sessionNonce++;
        this.rankRun = null;
        this.rankActions = [];
        this.ui?.dispose();
        this.renderer?.dispose();
        this.audio.dispose();
        if (this.context) delete this.context.root.dataset.crittersDialog;
    }
}
