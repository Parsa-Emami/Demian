import BaseGame from '../../contracts/BaseGame.js';
import { TETRIS_CONFIG } from './config/TetrisConfig.js';
import TetrisScoreStore from './persistence/TetrisScoreStore.js';
import TetrisRenderer from './render/TetrisRenderer.js';
import TetrisEngine from './systems/TetrisEngine.js';
import TetrisHud from './ui/TetrisHud.js';

function durationLabel(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function clearLabel(award) {
    if (award.perfectClear) return 'PERFECT CLEAR';
    if (award.tSpin) return award.lines > 0 ? `T-SPIN ${award.lines}` : 'T-SPIN';
    return ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'][award.lines] ?? '';
}

export default class TetrisGame extends BaseGame {
    constructor() {
        super();
        this.context = null;
        this.engine = null;
        this.renderer = null;
        this.hud = null;
        this.scoreStore = null;
        this.snapshot = null;
        this.completed = false;
        this.pixelRatio = 1;
    }

    async preload(context) {
        context.eventBus.emit('tetris:preload', { progress: 100 });
    }

    async enter(context) {
        this.context = context;
        this.scoreStore = new TetrisScoreStore();
        this.engine = new TetrisEngine({
            config: TETRIS_CONFIG,
            onEvent: (event) => this.onEngineEvent(event),
        });
        this.renderer = new TetrisRenderer(context, TETRIS_CONFIG);
        this.hud = new TetrisHud({
            root: context.root,
            animation: context.animation,
            profile: this.scoreStore.snapshot(),
        });
        this.hud.mount();
        this.applySettings(context.settings.snapshot());
        this.resize();
    }

    startSession(params = {}) {
        this.completed = false;
        this.hud.setPaused(false);
        this.hud.setProfile(this.scoreStore.snapshot());
        this.snapshot = this.engine.start({
            seed: params.seed,
            replay: params.replay ?? null,
        });
        this.hud.update(this.snapshot);
        this.context.eventBus.emit('tetris:session-started', {
            seed: this.snapshot.seed,
            replay: this.snapshot.isReplay,
        });
    }

    fixedUpdate(deltaTime, input) {
        if (this.completed) return;
        this.engine.update(deltaTime, input);
        this.snapshot = this.engine.snapshot();
    }

    update() {
        if (!this.snapshot) return;
        this.hud.update(this.snapshot);
    }

    render(_alpha, deltaTime) {
        this.renderer.render(this.snapshot, deltaTime);
    }

    onEngineEvent(event) {
        this.context?.eventBus.emit(`tetris:${event.type}`, event);

        if (event.type === 'lines-cleared') {
            this.renderer?.flashRows(event.rows);
        }

        if (event.type === 'piece-locked' && event.award.lines > 0) {
            const label = clearLabel(event.award);
            const suffix = event.award.backToBack && event.award.difficult ? ' · B2B' : '';
            const combo = event.award.combo > 0 ? ` · COMBO ×${event.award.combo + 1}` : '';
            this.hud?.announce(`${label}${suffix}${combo}`, event.award.difficult ? 'accent' : 'info');
        }

        if (event.type === 'game-over') {
            this.finishSession(event);
        }
    }

    finishSession(result) {
        if (this.completed) return;
        this.completed = true;
        const commit = result.isReplay
            ? { profile: this.scoreStore.snapshot(), isNewHighScore: false }
            : this.scoreStore.commitSession(result);
        this.hud?.setProfile(commit.profile);
        this.hud?.announce(commit.isNewHighScore ? 'NEW HIGH SCORE' : 'GAME OVER', commit.isNewHighScore ? 'success' : 'danger');

        this.context.eventBus.emit('tetris:replay-ready', {
            replay: result.replay,
            seed: result.seed,
        });
        this.context.app.completeGame({
            title: commit.isNewHighScore ? 'رکورد جدید!' : 'TETRIS · GAME OVER',
            subtitle: result.isReplay
                ? 'بازپخش قطعی به پایان رسید.'
                : `Seed: ${result.seed}`,
            score: result.score,
            stats: {
                'خط پاک‌شده': result.lines,
                'Level': result.level,
                'قطعه‌ها': result.pieces,
                'Tetris': result.tetrises,
                'T-Spin': result.tSpins,
                'بیشترین Combo': result.maxCombo,
                'زمان': durationLabel(result.durationSeconds),
                'High Score': commit.profile.highScore,
            },
            replay: result.replay,
            seed: result.seed,
            isNewHighScore: commit.isNewHighScore,
        });
    }

    applySettings(settings = {}) {
        const max = this.context?.services.performanceProfile.maxPixelRatio ?? 1.5;
        const device = Math.min(window.devicePixelRatio || 1, max);
        const ratios = {
            performance: Math.min(0.85, device),
            balanced: Math.min(1.1, device),
            high: device,
            auto: device,
        };
        this.pixelRatio = ratios[settings.quality] ?? device;
        this.resize();
    }

    resize() {
        this.renderer?.resize(this.pixelRatio);
    }

    pause() {
        this.hud?.setPaused(true);
    }

    resume() {
        this.hud?.setPaused(false);
    }

    async exit() {
        this.context?.eventBus.emit('tetris:session-exited', {
            seed: this.engine?.seed ?? null,
        });
    }

    dispose() {
        this.hud?.dispose();
        this.renderer?.dispose();
        this.context = null;
        this.engine = null;
        this.renderer = null;
        this.hud = null;
        this.snapshot = null;
    }
}
