import EventBus from '../core/EventBus';
import PerformanceProfile from '../core/PerformanceProfile';
import InputRouter from '../input/InputRouter';
import GameRegistry from '../registry/GameRegistry';
import { GAME_DEFINITIONS } from '../registry/GameDefinitions';
import GameRuntime from '../runtime/GameRuntime';
import CharacterVisualService from '../characters/runtime/CharacterVisualService.js';
import AnimationService from '../services/AnimationService';
import RendererService from '../services/RendererService';
import CollisionWorld from '../shared/collision/CollisionWorld';
import InteractionService from '../shared/interaction/InteractionService';
import NavigationService from '../shared/navigation/NavigationService';
import StoryEventJournal from '../shared/story/StoryEventJournal';
import { assertCafeGameDefinition, CAFE_ENVIRONMENT_ID } from '../shared/cafe/CafeEnvironmentContract.js';
import SettingsStore from '../settings/SettingsStore';
import ControlLayoutService from '../controls/ControlLayoutService';
import GameShell from '../shell/GameShell';
import SessionStateMachine, { SESSION_STATES } from './SessionStateMachine';

const MENU_BACKDROP_GAME_ID = 'open-world';

/**
 * Composition root for Demian Game Platform.
 *
 * Shared services live here. The shell coordinates screens while this class
 * owns transactional game switches and session lifecycle.
 */
export default class GameApplication {
    constructor(container, options = {}) {
        if (!(container instanceof HTMLElement)) {
            throw new Error('Demian game container was not found.');
        }

        this.container = container;
        this.root = container.closest('[data-character-manager]') ?? document.body;
        this.options = options;
        this.eventBus = new EventBus();
        this.collision = new CollisionWorld({ eventBus: this.eventBus, cellSize: 4 });
        this.interaction = new InteractionService({
            eventBus: this.eventBus,
            collisionWorld: this.collision,
        });
        this.navigation = new NavigationService({ eventBus: this.eventBus });
        this.storyJournal = new StoryEventJournal();
        this.storyJournalSubscriptions = [
            this.eventBus.on('game:session-started', ({ gameId }) => {
                if (gameId && !['role-play', 'open-world'].includes(gameId)) this.storyJournal.append('play', { gameId });
            }),
            this.eventBus.on('game:completed', ({ gameId, outcome, won, score }) => {
                if (gameId && (won === true || outcome === 'win' || outcome === 'success')) this.storyJournal.append('win', { gameId, score: Number(score) || 0 });
            }),
        ];
        this.rendererService = new RendererService(container);
        this.performanceProfile = new PerformanceProfile(this.rendererService.renderer);
        this.characterVisuals = new CharacterVisualService({
            eventBus: this.eventBus,
            performanceProfile: this.performanceProfile,
        });
        this.settings = new SettingsStore();
        this.animation = new AnimationService({
            reducedMotion: this.settings.resolvedReducedMotion(),
        });
        this.input = new InputRouter({ root: document, initialContext: 'MENU' });
        this.controlLayouts = new ControlLayoutService({ root: this.root, eventTarget: document });
        this.registry = new GameRegistry(GAME_DEFINITIONS);
        this.runtime = new GameRuntime({
            inputRouter: this.input,
            eventBus: this.eventBus,
        });
        this.shell = new GameShell({
            root: this.root,
            app: this,
            eventBus: this.eventBus,
            animation: this.animation,
            settings: this.settings,
        });

        this.activeGame = null;
        this.activeGameId = null;
        this.activeDefinition = null;
        this.bootPromise = null;
        this.switchQueue = Promise.resolve();
        this.disposed = false;
        this.paused = false;
        this.session = new SessionStateMachine({ eventBus: this.eventBus });
        this.menuBackdropGameId = MENU_BACKDROP_GAME_ID;

        this.onResize = this.handleLayoutChange.bind(this);
        this.unsubscribeSettings = this.settings.subscribe(
            ({ current }) => this.applySettings(current),
            { immediate: true }
        );
        window.addEventListener('resize', this.onResize);
    }

    get characterManager() {
        return this.activeGame?.characterManager ?? null;
    }

    get sessionState() {
        return this.session.state;
    }

    transitionSession(next, metadata = {}) {
        const state = this.session.transition(next, metadata);
        this.root.dataset.sessionState = state;
        return state;
    }

    async boot() {
        if (this.disposed) {
            throw new Error('Disposed GameApplication cannot be booted.');
        }

        if (!this.bootPromise) {
            this.bootPromise = (async () => {
                this.shell.boot();
                this.controlLayouts.boot();
                await this.shell.showBoot({
                    progress: 4,
                    message: 'در حال راه‌اندازی Game Shell…',
                });

                // Animation loading is progressive enhancement and never blocks the game.
                this.animation.boot();
                this.shell.setBootProgress(18, 'در حال آماده‌سازی Renderer مشترک…');
                this.eventBus.emit('application:boot-step', { progress: 18 });

                this.shell.setBootProgress(34, 'در حال بارگذاری Café Demian…');
                await this.performGameSwitch(this.menuBackdropGameId, {
                    initial: true,
                    menuBackdrop: true,
                });

                this.runtime.start();
                this.shell.setBootProgress(88, 'در حال همگام‌سازی رابط و ورودی‌ها…');
                this.synchronizeUi();
                await this.enterMenuState({ initial: true });
                this.shell.setBootProgress(100, 'آماده');

                this.eventBus.emit('application:ready', {
                    gameId: this.activeGameId,
                    sessionState: this.sessionState,
                });
                return this;
            })();
        }

        return this.bootPromise;
    }

    showMenu(options = {}) {
        const operation = this.switchQueue.then(() => this.enterMenuState(options));
        this.switchQueue = operation.catch(() => undefined);
        return operation;
    }

    async enterMenuState({ initial = false } = {}) {
        if (this.disposed) return;

        if (this.activeGameId !== this.menuBackdropGameId || !this.activeGame) {
            await this.performGameSwitch(this.menuBackdropGameId, {
                menuBackdrop: true,
                fromExit: true,
            });
        }

        this.paused = false;
        if (this.runtime.paused) {
            this.runtime.resume();
        }
        this.input.setContext('MENU');
        this.transitionSession(SESSION_STATES.MENU, { initial });
        this.root.dataset.activeGame = this.activeGameId ?? '';
        this.applyOrientationPreference('any');
        await this.shell.showCafeMenu();
        this.activeGame?.enterMenuMode?.();
        this.eventBus.emit('application:menu-shown', { initial });
    }

    launchGame(gameId, params = {}) {
        const operation = this.switchQueue.then(async () => {
            if (this.disposed) {
                throw new Error('Disposed GameApplication cannot launch a game.');
            }
            if (!this.registry.has(gameId)) {
                throw new Error(`Game "${gameId}" is not available in this phase.`);
            }

            this.transitionSession(SESSION_STATES.LOADING, { gameId });
            await this.shell.showLoading(gameId, {
                progress: 8,
                step: 'در حال آماده‌سازی ماژول بازی…',
            });

            if (this.activeGameId !== gameId || !this.activeGame || params.forceReload) {
                await this.performGameSwitch(gameId, params);
            } else {
                this.eventBus.emit('game:loading-step', {
                    gameId,
                    progress: 100,
                    step: 'بازی از حافظه آماده است',
                });
            }

            await this.beginGameSession(params);
            return this.activeGame;
        });

        const guarded = operation.catch(async (error) => {
            await this.enterMenuState().catch(() => undefined);
            throw error;
        });
        this.switchQueue = guarded.catch(() => undefined);
        return guarded;
    }

    async beginGameSession(params = {}) {
        if (!this.activeGame || !this.activeDefinition) {
            throw new Error('No active game is ready to start.');
        }

        this.paused = false;
        this.transitionSession(SESSION_STATES.PLAYING, { gameId: this.activeGameId });
        this.root.dataset.activeGame = this.activeGameId;
        this.applyOrientationPreference(this.activeDefinition.orientation);
        this.input.setContext(this.activeDefinition.inputContext);

        if (this.runtime.paused) {
            // A freshly entered game must not receive resume() before its first session.
            this.runtime.resume({ notifyGame: false });
        }

        await this.activeGame.startSession?.(params);
        this.activeGame.resize?.();
        await this.shell.hideAll('playing');
        this.eventBus.emit('game:session-started', {
            gameId: this.activeGameId,
            definition: this.activeDefinition,
        });
    }

    async performGameSwitch(gameId, params = {}) {
        const definition = this.registry.get(gameId);
        assertCafeGameDefinition(gameId, definition);
        const previousGame = this.activeGame;
        const previousGameId = this.activeGameId;
        const runtimeWasPaused = this.runtime.paused;
        const runtimeWasRunning = this.runtime.running;

        this.eventBus.emit('game:loading', { gameId, definition });
        this.eventBus.emit('game:loading-step', {
            gameId,
            progress: 18,
            step: 'در حال دریافت ماژول بازی…',
        });

        if (runtimeWasRunning && !runtimeWasPaused) {
            previousGame?.pause?.();
            this.runtime.pause({ notifyGame: false });
        }

        let nextGame = null;
        try {
            nextGame = await this.registry.create(gameId);
            const context = this.createGameContext(definition);

            this.eventBus.emit('game:loading-step', {
                gameId,
                progress: 42,
                step: 'در حال پیش‌بارگذاری منابع…',
            });
            await nextGame.preload(context);

            this.eventBus.emit('game:loading-step', {
                gameId,
                progress: 68,
                step: 'در حال ساخت صحنه و سیستم‌ها…',
            });
            await nextGame.enter(context, params);

            this.runtime.setGame(nextGame);
            this.activeGame = nextGame;
            this.activeGameId = gameId;
            this.activeDefinition = definition;
            this.applySettings(this.settings.snapshot());
            nextGame.resize?.();

            if (previousGame && previousGame !== nextGame) {
                try {
                    await previousGame.exit();
                } catch (error) {
                    console.warn(`Game "${previousGameId}" exit hook failed.`, error);
                } finally {
                    previousGame.dispose();
                }
            }

            this.root.dataset.activeGame = gameId;
            this.root.dataset.gameEnvironment = CAFE_ENVIRONMENT_ID;
            this.applyOrientationPreference(definition.orientation);
            this.eventBus.emit('game:loading-step', {
                gameId,
                progress: 100,
                step: 'آماده‌ی اجرا',
            });
            this.eventBus.emit('game:launched', {
                gameId,
                previousGameId,
                definition,
            });

            if (runtimeWasRunning && !runtimeWasPaused && !this.paused) {
                this.runtime.resume({ notifyGame: false });
            }
            return nextGame;
        } catch (error) {
            nextGame?.dispose?.();
            this.runtime.setGame(previousGame);
            this.activeGame = previousGame;
            this.activeGameId = previousGameId;
            this.activeDefinition = previousGameId ? this.registry.get(previousGameId) : null;
            this.root.dataset.activeGame = previousGameId ?? '';
            this.root.dataset.gameEnvironment = previousGameId ? CAFE_ENVIRONMENT_ID : '';
            this.applyOrientationPreference(this.activeDefinition?.orientation ?? 'any');
            previousGame?.resize?.();
            if (runtimeWasRunning && !runtimeWasPaused) {
                previousGame?.resume?.();
                this.runtime.resume({ notifyGame: false });
            }
            this.eventBus.emit('game:load-failed', { gameId, error });
            throw error;
        }
    }

    createGameContext(definition) {
        return Object.freeze({
            app: this,
            container: this.container,
            root: this.root,
            options: Object.freeze({ ...this.options }),
            definition,
            eventBus: this.eventBus,
            input: this.input,
            renderer: this.rendererService,
            animation: this.animation,
            settings: this.settings,
            services: Object.freeze({
                performanceProfile: this.performanceProfile,
                settings: this.settings,
                collision: this.collision,
                interaction: this.interaction,
                navigation: this.navigation,
                storyJournal: this.storyJournal,
                characterVisuals: this.characterVisuals,
            }),
        });
    }


    applyOrientationPreference(orientation = 'any') {
        const resolved = ['portrait', 'landscape'].includes(orientation) ? orientation : 'any';
        this.root.dataset.gameOrientation = resolved;
        this.root.dispatchEvent(new CustomEvent('game:orientation-changed', {
            bubbles: true,
            detail: { orientation: resolved, gameId: this.activeGameId },
        }));
    }

    pauseGame() {
        if (this.paused || this.sessionState !== 'playing') return;
        this.paused = true;
        this.transitionSession(SESSION_STATES.PAUSED, { gameId: this.activeGameId });
        this.input.setContext('PAUSE');
        this.runtime.pause();
        this.shell.showPause(this.activeDefinition);
        this.eventBus.emit('game:session-paused', { gameId: this.activeGameId });
    }

    resumeGame() {
        if (!this.paused || this.sessionState !== 'paused') return;
        this.paused = false;
        this.transitionSession(SESSION_STATES.PLAYING, { gameId: this.activeGameId });
        this.input.setContext(this.activeDefinition?.inputContext ?? 'MENU');
        this.shell.manager.close('pause', 'resume').catch(() => undefined);
        this.runtime.resume();
        this.eventBus.emit('game:session-resumed', { gameId: this.activeGameId });
    }

    async restartGame() {
        if (!this.activeGameId) return null;
        return this.launchGame(this.activeGameId, { forceReload: true, restart: true });
    }

    async exitGame() {
        const exitedGameId = this.activeGameId;
        await this.showMenu();
        this.eventBus.emit('game:exited', { gameId: exitedGameId });
    }

    completeGame(result = {}) {
        if (!this.activeGame) return;
        this.paused = true;
        this.transitionSession(SESSION_STATES.RESULTS, { gameId: this.activeGameId });
        this.input.setContext('PAUSE');
        this.runtime.pause();
        this.eventBus.emit('game:completed', {
            gameId: this.activeGameId,
            title: result.title ?? this.activeDefinition?.title,
            ...result,
        });
    }

    applySettings(settings) {
        if (!settings || !this.root) return;
        this.animation.setReducedMotion(this.settings.resolvedReducedMotion());
        this.root.dataset.motion = this.animation.reducedMotion ? 'reduced' : 'full';
        this.root.dataset.qualityPreference = settings.quality;
        this.root.dataset.hudVisible = String(settings.hudVisible);
        this.root.dataset.hintsVisible = String(settings.hintsVisible);
        this.root.dataset.interfaceDensity = settings.interfaceDensity;
        this.root.dataset.soundEnabled = String(settings.soundEnabled);
        this.root.dataset.musicEnabled = String(settings.musicEnabled);
        this.activeGame?.applySettings?.(settings);
        this.eventBus.emit('settings:applied', settings);
    }

    synchronizeUi() {
        this.activeGame?.synchronizeUi?.();
    }

    toggleCamera() {
        this.activeGame?.toggleCamera?.();
    }

    focusCharacter(options) {
        this.activeGame?.focusCharacter?.(options);
    }

    handleLayoutChange() {
        this.activeGame?.resize?.();
        window.setTimeout(() => this.activeGame?.resize?.(), 360);
    }

    async dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.transitionSession(SESSION_STATES.DISPOSED);
        await this.switchQueue.catch(() => undefined);
        window.removeEventListener('resize', this.onResize);
        this.unsubscribeSettings?.();
        this.runtime.dispose();

        if (this.activeGame) {
            await this.activeGame.exit();
            this.activeGame.dispose();
        }

        await this.shell.dispose();
        this.controlLayouts.dispose();
        this.input.dispose();
        this.animation.dispose();
        this.settings.dispose();
        this.interaction.dispose();
        this.storyJournalSubscriptions?.forEach((unsubscribe) => unsubscribe());
        this.storyJournal.dispose();
        this.characterVisuals.dispose();
        this.navigation.dispose();
        this.collision.dispose();
        this.rendererService.dispose();
        this.eventBus.clear();
        this.activeGame = null;
        this.activeGameId = null;
    }
}
