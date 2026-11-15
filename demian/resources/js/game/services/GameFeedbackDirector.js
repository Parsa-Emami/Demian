import FeedbackAudioEngine from './FeedbackAudioEngine.js';
import FeedbackBurstPool from './FeedbackBurstPool.js';

const KIND_ALIASES = Object.freeze({
    card: 'discover',
    power: 'discover',
    served: 'score',
    spill: 'lose',
    'wrong-table': 'error',
    discovery: 'discover',
    arrange: 'score',
    clear: 'score',
    miss: 'error',
    match: 'score',
    cascade: 'score',
    passed: 'score',
    pickup: 'discover',
});

export default class GameFeedbackDirector {
    constructor({ root, eventBus, settings, audio = new FeedbackAudioEngine(),
        now = () => globalThis.performance?.now?.() ?? Date.now() } = {}) {
        this.root = root;
        this.eventBus = eventBus;
        this.settings = settings;
        this.audio = audio;
        this.now = now;
        this.visual = null;
        this.subscriptions = [];
        this.booted = false;
        this.disposed = false;
        this.activeGameId = null;
        this.sessionState = 'menu';
        this.onInteraction = this.onInteraction.bind(this);
        this.onClick = this.onClick.bind(this);
        this.onVisibility = this.onVisibility.bind(this);
    }

    boot() {
        if (this.booted || this.disposed || !this.root) return;
        this.booted = true;
        this.visual = new FeedbackBurstPool({
            host: this.root.querySelector('[data-game-feedback-host]'),
            now: this.now,
        });
        this.root.addEventListener('pointerdown', this.onInteraction, { passive: true, capture: true });
        this.root.addEventListener('keydown', this.onInteraction, true);
        this.root.addEventListener('click', this.onClick);
        globalThis.document?.addEventListener?.('visibilitychange', this.onVisibility);
        this.onVisibility();

        this.subscriptions.push(
            this.eventBus.on('game:session-started', ({ gameId }) => {
                this.activeGameId = gameId;
                this.sessionState = 'playing';
                this.audio.setGame(gameId);
                this.cue('start');
            }),
            this.eventBus.on('game:completed', ({ gameId, won, outcome }) => {
                if (gameId !== this.activeGameId) return;
                this.sessionState = 'results';
                this.audio.setGame(null);
                this.cue(won === true || ['win', 'success'].includes(outcome) ? 'win' : 'lose');
            }),
            this.eventBus.on('game:session-paused', () => {
                this.sessionState = 'paused';
                this.audio.setPaused(true);
                this.visual.clear();
            }),
            this.eventBus.on('game:session-resumed', () => {
                this.sessionState = 'playing';
                this.audio.setPaused(false);
            }),
            this.eventBus.on('game:loading', () => this.reset()),
            this.eventBus.on('application:menu-shown', () => this.reset()),
            this.eventBus.on('game:load-failed', () => {
                this.reset();
                this.cue('error');
            }),
            this.eventBus.on('feedback:cue', ({ gameId, kind } = {}) => {
                if (this.sessionState !== 'playing' || gameId !== this.activeGameId) return;
                const resolved = KIND_ALIASES[kind] ?? kind;
                if (resolved === 'score' || resolved === 'discover'
                    || resolved === 'error' || resolved === 'lose') this.cue(resolved, { visualOnly: gameId !== 'dino-run' });
            }),
            this.eventBus.on('world:chunk-discovered', () => {
                if (this.activeGameId === 'open-world' && this.sessionState === 'playing') {
                    this.cue('discover');
                }
            }),
        );
    }

    configure(settings, { reducedMotion = false, economy = false } = {}) {
        this.audio.configure(settings);
        this.visual?.configure({ reducedMotion, economy });
    }

    onInteraction(event) {
        if (event.type === 'keydown' && (event.repeat || event.altKey || event.ctrlKey || event.metaKey)) return;
        this.audio.unlock();
    }

    onClick(event) {
        if (event.target?.closest?.('[data-shell-action], [data-game-launch]')) {
            this.audio.play('ui');
        }
    }

    onVisibility() {
        const hidden = Boolean(globalThis.document?.hidden);
        this.audio.setHidden(hidden);
        if (hidden) this.visual?.clear();
    }

    cue(kind, { visualOnly = false } = {}) {
        if (this.disposed) return;
        if (!visualOnly) this.audio.play(kind);
        this.visual?.burst(kind);
    }

    reset() {
        this.activeGameId = null;
        this.sessionState = 'menu';
        this.audio.setGame(null);
        this.audio.stopVoices();
        this.visual?.clear();
    }

    snapshot() {
        return Object.freeze({
            gameId: this.activeGameId,
            state: this.sessionState,
            audioVoices: this.audio.voices.size,
            musicVoices: this.audio.musicNodes.length,
            effectNodes: this.visual?.nodes.length ?? 0,
            activeEffects: this.visual?.active.size ?? 0,
        });
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.root?.removeEventListener('pointerdown', this.onInteraction, true);
        this.root?.removeEventListener('keydown', this.onInteraction, true);
        this.root?.removeEventListener('click', this.onClick);
        globalThis.document?.removeEventListener?.('visibilitychange', this.onVisibility);
        for (const unsubscribe of this.subscriptions) unsubscribe();
        this.subscriptions = [];
        this.visual?.dispose();
        this.audio.dispose();
        this.visual = null;
    }
}
