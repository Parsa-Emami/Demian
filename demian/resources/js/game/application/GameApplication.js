import EventBus from '../core/EventBus';
import PerformanceProfile from '../core/PerformanceProfile';
import RenderQuality from '../performance/RenderQuality.js';
import { resolveRenderFrameRate } from '../performance/FrameRatePolicy.js';
import InputRouter from '../input/InputRouter';
import GameRegistry from '../registry/GameRegistry';
import { GAME_DEFINITIONS } from '../registry/GameDefinitions';
import GameRuntime from '../runtime/GameRuntime';
import CharacterVisualService from '../characters/runtime/CharacterVisualService.js';
import MenuCharacterRoster from '../characters/MenuCharacterRoster.js';
import AnimationService from '../services/AnimationService';
import GameFeedbackDirector from '../services/GameFeedbackDirector.js';
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
import ArcadeLeaderboardService from '../leaderboard/ArcadeLeaderboardService.js';
import DeviceQaController from '../performance/DeviceQaController.js';
import AnonymousGameTelemetry from '../performance/AnonymousGameTelemetry.js';

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
        this.renderQuality = new RenderQuality(this.performanceProfile.tier);
        this.root.dataset.performanceTier = this.performanceProfile.tier;
        this.characterVisuals = new CharacterVisualService({
            eventBus: this.eventBus,
            performanceProfile: this.performanceProfile,
        });
        this.menuCharacterRoster = new MenuCharacterRoster({
            eventBus: this.eventBus,
            visualService: this.characterVisuals,
        });
        this.settings = new SettingsStore();
        this.leaderboards = new ArcadeLeaderboardService();
        this.opsTelemetry = new AnonymousGameTelemetry();
        this.opsSubscriptions = [
            this.eventBus.on('application:boot-timing', ({ durationMs }) =>
                this.opsTelemetry.emit('menu_ready', { durationMs })),
            this.eventBus.on('game:load-timing', ({ gameId, durationMs }) =>
                this.opsTelemetry.emit('game_load', { game: gameId, durationMs })),
            this.eventBus.on('game:load-failed', ({ gameId }) =>
                this.opsTelemetry.emit('game_error', { game: gameId })),
        ];
        this.animation = new AnimationService({
            reducedMotion: this.settings.resolvedReducedMotion(),
        });
        this.input = new InputRouter({ root: document, touchRoot: this.root, initialContext: 'MENU' });
        this.controlLayouts = new ControlLayoutService({ root: this.root, eventTarget: document });
        this.registry = new GameRegistry(GAME_DEFINITIONS);
        this.runtime = new GameRuntime({
            inputRouter: this.input,
            eventBus: this.eventBus,
            canRender: () => this.rendererService.isAvailable(),
            observeFrame: (seconds) => {
                if (this.sessionState === SESSION_STATES.PLAYING && this.renderQuality.observe(seconds)) this.applyRenderQuality();
            },
            observeRender: timestamp => {
                this.deviceQa?.rendered(timestamp);
                this.opsTelemetry?.frame(timestamp, this.activeGameId,
                    this.sessionState === SESSION_STATES.PLAYING);
            },
        });
        this.shell = new GameShell({
            root: this.root,
            app: this,
            eventBus: this.eventBus,
            animation: this.animation,
            settings: this.settings,
        });

        this.feedback = new GameFeedbackDirector({
            root: this.root, eventBus: this.eventBus, settings: this.settings,
        });
        this.activeGame = null;
        this.activeGameId = null;
        this.activeDefinition = null;
        this.bootPromise = null;
        this.switchQueue = Promise.resolve();
        this.disposed = false;
        this.paused = false;
        this.session = new SessionStateMachine({ eventBus: this.eventBus });
        // A thrown simulation/update step is not a recoverable rendering
        // error: the current ranked run must never resume with partial state.
        this.unsubscribeRuntimeFatal = this.eventBus.on('runtime:fatal', () => {
            if (this.disposed || this.sessionState !== SESSION_STATES.PLAYING) return;
            this.paused = true;
            this.transitionSession(SESSION_STATES.PAUSED, { gameId: this.activeGameId });
            this.input.setContext('PAUSE');
            this.shell.showPause(this.activeDefinition);
            this.shell.toast('خطای موتور بازی؛ برای جلوگیری از ثبت امتیاز نادرست، بازی متوقف شد. دور را دوباره شروع کنید.', 'error');
        });
        this.menuBackdropGameId = MENU_BACKDROP_GAME_ID; // Only loaded when a player actually enters that game.
        this.loadingTimings = [];

        this.onResize = this.handleLayoutChange.bind(this);
        this.unsubscribeSettings = this.settings.subscribe(
            ({ current }) => this.applySettings(current),
            { immediate: true }
        );
        this.layoutFrame = null;
        this.onVisibility = () => this.renderQuality.resetMeasurements();
        document.addEventListener('visibilitychange', this.onVisibility);
        this.resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(this.onResize) : null;
        this.resizeObserver?.observe(container);
        window.addEventListener('resize', this.onResize);
        if (new URLSearchParams(window.location.search).get('deviceQa') === '1') {
            this.deviceQa = new DeviceQaController(this);
            // The extra performance.now() calls exist only in explicitly
            // enabled device QA sessions, never for ordinary players.
            this.runtime.observeWork = milliseconds => this.deviceQa?.frameWork(milliseconds);
            this.deviceQa.mount();
        }
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
                const bootStartedAt = globalThis.performance?.now?.() ?? Date.now();
                this.shell.boot();
                this.feedback.boot();
                this.feedback.configure(this.settings.snapshot(), {
                    reducedMotion: this.settings.resolvedReducedMotion(),
                    economy: this.renderQuality.economical || this.performanceProfile.tier === 'low',
                });
                this.controlLayouts.boot();
                // In the static release the small parser-time menu has
                // already become visible while the atomic engine downloaded.
                // Adopt it without flashing a second boot screen. Laravel's
                // non-static pages retain the original boot sequence.
                const instantMenu = this.root.dataset.instantMenu === 'true';
                if (!instantMenu) {
                    await this.shell.showBoot({
                        progress: 4,
                        message: 'در حال آماده‌سازی دمیان…',
                    });
                }

                // Boot the menu before the expensive optional Open World
                // chunks, player sprites and remote character API. Each game
                // is loaded only when selected, not just to draw a backdrop.
                this.animation.boot();
                if (!instantMenu) this.shell.setBootProgress(88, 'منو آماده است…');
                this.runtime.start();
                await this.enterMenuState({ initial: true });
                const bootReadyMs = Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - bootStartedAt);
                this.loadingTimings.push({ type: 'menu', durationMs: bootReadyMs });
                if (this.loadingTimings.length > 24) this.loadingTimings.shift();
                this.eventBus.emit('application:boot-timing', { durationMs: bootReadyMs });

                this.eventBus.emit('application:ready', {
                    gameId: this.activeGameId,
                    // Initial settings subscription runs before SessionStateMachine
            // construction; treat the boot screen as an idle 30 Hz surface.
            sessionState: this.session?.state ?? 'booting',
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

        // Menu has its own lightweight HTML/CSS screen. Keeping a full
        // Open World instance alive as a decorative backdrop costs network
        // images, decoded textures, chunk work and a blocking round trip when
        // leaving other mini-games.
        const previousGame = this.activeGame;
        const previousGameId = this.activeGameId;
        // Leaving a game invalidates all optional NPC/attacker artwork. Do not
        // let late decodes compete with the next foreground game launch.
        this.characterVisuals.cancelBackgroundLoads();
        this.runtime.setGame(null);
        this.activeGame = null;
        this.activeGameId = null;
        this.activeDefinition = null;
        this.paused = false;
        if (this.runtime.paused) this.runtime.resume({ notifyGame: false });
        this.input.setContext('MENU');
        this.transitionSession(SESSION_STATES.MENU, { initial });
        this.applyRenderQuality(); // 30Hz UI poll, no game simulation.
        this.root.dataset.activeGame = '';
        this.root.dataset.gameEnvironment = '';
        this.applyOrientationPreference('any');
        await this.shell.showCafeMenu();
        this.eventBus.emit('application:menu-shown', { initial });
        // Cleanup is subsequent to showing the menu, not a condition for it.
        if (previousGame) {
            try { await previousGame.exit(); }
            catch (error) { console.warn(`Game "${previousGameId}" exit hook failed.`, error); }
            finally { previousGame.dispose(); }
        }
    }

    launchGame(gameId, params = {}) {
        const operation = this.switchQueue.then(async () => {
            if (this.disposed) {
                throw new Error('Disposed GameApplication cannot launch a game.');
            }
            if (!this.registry.has(gameId)) {
                throw new Error(`Game "${gameId}" is not available in this phase.`);
            }

            const loadingStartedAt = globalThis.performance?.now?.() ?? Date.now();
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
            const durationMs = Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - loadingStartedAt);
            this.loadingTimings.push({ type: 'game', gameId, durationMs });
            if (this.loadingTimings.length > 24) this.loadingTimings.shift();
            this.eventBus.emit('game:load-timing', { gameId, durationMs });
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
        this.applyRenderQuality(); // Restore gameplay frame-rate preference.
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
            this.renderQuality.resetMeasurements();
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
                leaderboards: this.leaderboards,
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
        if (this.runtime.faulted) {
            this.shell.toast('این دور قابل ادامه نیست. بازی را دوباره شروع کنید.', 'error');
            return;
        }
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
        this.input.applyTouchControls(settings);
        this.animation.setReducedMotion(this.settings.resolvedReducedMotion());
        this.root.dataset.motion = this.animation.reducedMotion ? 'reduced' : 'full';
        this.root.dataset.qualityPreference = settings.quality;
        this.renderQuality.setPreference(settings.quality);
        this.applyRenderQuality(settings.frameRate);
        this.root.dataset.hudScale = settings.hudScale;
        this.root.dataset.hudContrast = settings.hudContrast;
        this.root.dataset.hudVisible = String(settings.hudVisible);
        this.root.dataset.hintsVisible = String(settings.hintsVisible);
        this.root.dataset.interfaceDensity = settings.interfaceDensity;
        this.root.dataset.soundEnabled = String(settings.soundEnabled);
        this.root.dataset.musicEnabled = String(settings.musicEnabled);
        this.activeGame?.applySettings?.(settings);
        this.feedback.configure(settings, {
            reducedMotion: this.settings.resolvedReducedMotion(),
            economy: this.renderQuality.economical || this.performanceProfile.tier === 'low',
        });
        this.eventBus.emit('settings:applied', settings);
    }

    applyRenderQuality(frameRate = this.settings.snapshot().frameRate) {
        const profile = this.renderQuality.profile;
        const changed = this.rendererService.quality !== profile;
        this.rendererService.quality = profile;
        this.root.dataset.renderQuality = this.renderQuality.economical ? 'economy' : profile.quality;
        const target = resolveRenderFrameRate({
            preference: frameRate,
            economical: this.renderQuality.economical,
            sessionState: this.sessionState,
        });
        this.root.dataset.renderFps = String(target);
        this.runtime.setRenderRate(target);
        this.feedback?.visual?.configure({
            reducedMotion: this.settings.resolvedReducedMotion(),
            economy: this.renderQuality.economical || this.performanceProfile.tier === 'low',
        });
        if (changed && this.activeGame) this.activeGame.resize?.({ reframe: false });
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
        if (this.layoutFrame !== null || this.disposed) return;
        this.layoutFrame = window.requestAnimationFrame(() => {
            this.layoutFrame = null;
            this.activeGame?.resize?.({ reframe: false });
        });
    }

    async dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.transitionSession(SESSION_STATES.DISPOSED);
        await this.switchQueue.catch(() => undefined);
        window.removeEventListener('resize', this.onResize);
        document.removeEventListener('visibilitychange', this.onVisibility);
        this.resizeObserver?.disconnect();
        if (this.layoutFrame !== null) window.cancelAnimationFrame(this.layoutFrame);
        this.unsubscribeSettings?.();
        this.unsubscribeRuntimeFatal?.();
        this.deviceQa?.dispose();
        this.runtime.dispose();

        if (this.activeGame) {
            await this.activeGame.exit();
            this.activeGame.dispose();
        }

        await this.shell.dispose();
        this.feedback.dispose();
        this.controlLayouts.dispose();
        this.input.dispose();
        this.animation.dispose();
        this.settings.dispose();
        this.interaction.dispose();
        this.opsSubscriptions?.forEach((unsubscribe) => unsubscribe());
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
