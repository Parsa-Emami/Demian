const DEFAULT_FIXED_STEP = 1 / 60;
const ERROR_REPORT_INTERVAL = 1000;

/**
 * One deterministic fixed-step loop shared by all games.
 */
export default class GameRuntime {
    constructor({
        inputRouter,
        eventBus,
        fixedStep = DEFAULT_FIXED_STEP,
        maxFrameDelta = 0.045,
        maxSubSteps = 5,
        requestFrame = (callback) => window.requestAnimationFrame(callback),
        cancelFrame = (id) => window.cancelAnimationFrame(id),
        scheduleIdlePoll = (callback, ms) => setTimeout(callback, ms),
        cancelIdlePoll = (id) => clearTimeout(id),
        idlePollIntervalMs = 125,
        visibilityTarget = typeof document !== 'undefined' ? document : null,
        canRender = () => true,
        observeFrame = null,
        observeRender = null,
        observeWork = null,
    }) {

        if (!Number.isFinite(fixedStep) || fixedStep <= 0
            || !Number.isFinite(maxFrameDelta) || maxFrameDelta <= 0
            || !Number.isSafeInteger(maxSubSteps) || maxSubSteps < 1
            || !Number.isFinite(idlePollIntervalMs) || idlePollIntervalMs <= 0) {
            throw new RangeError('Invalid fixed-step runtime timing policy.');
        }
        this.inputRouter = inputRouter;
        this.eventBus = eventBus;
        this.fixedStep = fixedStep;
        this.maxFrameDelta = maxFrameDelta;
        this.maxSubSteps = maxSubSteps;
        this.requestFrame = requestFrame;
        this.cancelFrame = cancelFrame;
        this.scheduleIdlePoll = scheduleIdlePoll;
        this.cancelIdlePoll = cancelIdlePoll;
        this.idlePollIntervalMs = idlePollIntervalMs;
        this.idlePollRequest = null;
        this.currentGame = null;
        this.running = false;
        this.paused = false;
        this.accumulator = 0;
        this.lastTimestamp = null;
        this.frameRequest = null;
        // Generation protects against canceled RAF callbacks, re-entrant
        // transitions and old-game work arriving after asynchronous switches.
        this.frameToken = 0;
        this.lifecycleVersion = 0;
        this.inTick = false;
        this.disposed = false;
        this.faulted = false;
        this.visibilityTarget = visibilityTarget;
        this.canRender = canRender;
        this.observeFrame = observeFrame;
        this.observeRender = observeRender;
        // Opt-in diagnostic only: avoid per-frame timer reads in production.
        this.observeWork = observeWork;
        this.renderInterval = 0;
        this.resetRenderTiming();
        this.errorCounts = new Map();
        this.lastErrorReport = new Map();

        this.tick = this.tick.bind(this);
        this.onVisibilityChange = this.onVisibilityChange.bind(this);
        this.pollWhilePaused = this.pollWhilePaused.bind(this);
        this.visibilityTarget?.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    setGame(game) {
        if (this.disposed) return;
        this.lifecycleVersion++;
        this.cancelScheduledFrame();
        this.faulted = false;
        this.currentGame = game;
        this.accumulator = 0;
        this.lastTimestamp = null;
        this.errorCounts.clear();
        this.lastErrorReport.clear();
        this.resetRenderTiming();
        this.scheduleFrame();
    }

    setRenderRate(rate) {
        const interval = rate > 0 ? 1 / rate : 0;
        if (this.renderInterval === interval) return;
        this.renderInterval = interval;
        this.resetRenderTiming();
    }

    resetRenderTiming() {
        this.renderElapsed = 0;
        this.renderDelta = 0;
        this.firstRender = true;
    }

    cancelScheduledFrame() {
        // Invalidate the closure even if a browser invokes it after cancel.
        this.frameToken++;
        if (this.frameRequest !== null) {
            const id = this.frameRequest;
            this.frameRequest = null;
            this.cancelFrame(id);
        }
    }

    scheduleFrame() {
        if (!this.disposed && !this.faulted && this.running && !this.paused
            && !this.visibilityTarget?.hidden && this.frameRequest === null) {
            const token = ++this.frameToken;
            this.frameRequest = this.requestFrame((timestamp) => {
                if (token !== this.frameToken || this.frameRequest === null) return;
                this.tick(timestamp);
            });
        }
    }

    schedulePausedInput() {
        if (this.running && this.paused && !this.visibilityTarget?.hidden && this.idlePollRequest === null) {
            // Gamepad pause/resume must remain usable, but no visual RAF or
            // gameplay simulation is needed. Poll controllers only ~8 Hz.
            this.idlePollRequest = this.scheduleIdlePoll(this.pollWhilePaused, this.idlePollIntervalMs);
        }
    }

    cancelPausedInput() {
        if (this.idlePollRequest !== null) {
            this.cancelIdlePoll(this.idlePollRequest);
            this.idlePollRequest = null;
        }
    }

    pollWhilePaused() {
        this.idlePollRequest = null;
        if (!this.running || !this.paused || this.visibilityTarget?.hidden) return;
        try { this.inputRouter.poll?.(); } catch (error) { this.reportError('input', error); }
        finally { this.schedulePausedInput(); }
    }

    start() {
        if (this.disposed || this.faulted || this.running) {
            return;
        }

        this.running = true;
        this.scheduleFrame();
        this.schedulePausedInput();
    }

    tick(timestamp) {
        // A nested RAF or canceled callback cannot run two updates at once.
        if (this.inTick) return;
        this.inTick = true;
        this.frameRequest = null;

        try {
            if (!this.running || this.visibilityTarget?.hidden || this.disposed
                || this.faulted) return;
            if (this.paused) {
                // Legacy direct tick calls still allow pause-menu navigation.
                try { this.inputRouter.poll?.(); }
                catch (error) { this.reportError('input', error, timestamp); }
                return;
            }

            const workStartedAt = this.observeWork
                ? (globalThis.performance?.now?.() ?? Date.now()) : null;
            try {
                // A broken or regressing browser timestamp must not poison the
                // simulation accumulator with NaN or a negative clock step.
                const valid = Number.isFinite(timestamp);
                const elapsed = valid && this.lastTimestamp !== null
                    ? Math.max(0, (timestamp - this.lastTimestamp) / 1000) : 0;
                this.lastTimestamp = valid ? timestamp : null;
                try { this.inputRouter.poll?.(); }
                catch (error) { this.reportError('input', error, timestamp); }

                if (!this.canRender()) {
                    this.lastTimestamp = null;
                    this.accumulator = 0;
                    this.resetRenderTiming();
                    return;
                }

                try { this.observeFrame?.(elapsed); }
                catch (error) { this.reportError('observer', error, timestamp); }
                if (!this.paused && !this.faulted) {
                    this.step(Math.min(elapsed, this.maxFrameDelta), timestamp);
                }
            } catch (error) {
                this.reportError('frame', error, timestamp);
            } finally {
                if (workStartedAt !== null && !this.paused && !this.visibilityTarget?.hidden) {
                    const spentMs = Math.max(0,
                        (globalThis.performance?.now?.() ?? Date.now()) - workStartedAt);
                    try { this.observeWork?.(spentMs); } catch {
                        // Optional QA observers cannot interrupt gameplay.
                    }
                }
            }
        } finally {
            this.inTick = false;
            this.scheduleFrame();
        }
    }

    step(frameDelta, timestamp = globalThis.performance?.now?.() ?? Date.now()) {
        const game = this.currentGame;
        if (!game || this.paused || this.faulted || this.disposed) return;

        const version = this.lifecycleVersion;
        const delta = Number.isFinite(frameDelta)
            ? Math.min(Math.max(frameDelta, 0), this.maxFrameDelta) : 0;
        const epsilon = this.fixedStep * 1e-7;
        this.accumulator += delta;
        let steps = 0;

        while (this.accumulator + epsilon >= this.fixedStep && steps < this.maxSubSteps) {
            // Debit before game callbacks: a completed round may pause/reset
            // the accumulator from inside fixedUpdate().
            this.accumulator = Math.max(0, this.accumulator - this.fixedStep);
            let input;
            try {
                input = this.inputRouter.snapshot({ consumePresses: steps === 0 });
                game.fixedUpdate(this.fixedStep, input);
            } catch (error) {
                this.failSimulation('simulation', error, timestamp);
                return;
            }
            steps++;
            // Finishing a run, switching games, pausing, or stopping during
            // fixedUpdate must not execute another tick or render stale state.
            if (version !== this.lifecycleVersion || this.currentGame !== game
                || this.paused || this.faulted) return;
        }

        if (steps === this.maxSubSteps
            && this.accumulator + epsilon >= this.fixedStep) {
            const skipped = Math.floor((this.accumulator + epsilon) / this.fixedStep);
            const droppedSeconds = skipped * this.fixedStep;
            this.accumulator = Math.max(0, this.accumulator - droppedSeconds);
            this.eventBus?.emit('runtime:frame-drop', {
                frameDelta: delta, steps, droppedSeconds,
            });
        }

        const alpha = Math.min(1, Math.max(0, this.accumulator / this.fixedStep));
        try { game.update(delta); }
        catch (error) {
            this.failSimulation('update', error, timestamp);
            return;
        }
        if (version !== this.lifecycleVersion || this.currentGame !== game
            || this.paused || this.faulted) return;

        this.renderDelta += delta;
        this.renderElapsed += delta;
        if (!this.firstRender
            && this.renderElapsed + .0005 < this.renderInterval) return;
        this.renderElapsed = this.renderInterval
            ? Math.max(0, this.renderElapsed - this.renderInterval) % this.renderInterval
            : 0;
        const renderDelta = this.renderDelta;
        this.renderDelta = 0;
        this.firstRender = false;

        try {
            game.render(alpha, renderDelta);
            this.errorCounts.delete('render');
            this.lastErrorReport.delete('render');
        } catch (error) {
            this.reportError('render', error, timestamp);
            return;
        }
        try { this.observeRender?.(globalThis.performance?.now?.() ?? timestamp); }
        catch (error) { this.reportError('observer', error, timestamp); }
    }

    failSimulation(phase, error, timestamp) {
        // A partially applied ranked tick cannot be safely retried. Freeze
        // the active game rather than silently submitting an inconsistent run.
        this.faulted = true;
        this.reportError(phase, error, timestamp);
        try { this.pause(); }
        catch (pauseError) { this.reportError('pause', pauseError, timestamp); }
        try { this.eventBus?.emit('runtime:fatal', { phase }); }
        catch (notifyError) { this.reportError('observer', notifyError, timestamp); }
    }

    reportError(phase, error, timestamp = Date.now()) {
        const count = (this.errorCounts.get(phase) ?? 0) + 1;
        this.errorCounts.set(phase, count);
        const previous = this.lastErrorReport.get(phase) ?? -Infinity;
        const shouldReport = count === 1 || timestamp - previous >= ERROR_REPORT_INTERVAL;

        if (!shouldReport) return;
        this.lastErrorReport.set(phase, timestamp);
        console.error(`[Demian Runtime] ${phase} error`, error);
        this.eventBus?.emit('runtime:error', {
            phase,
            error,
            count,
            recoverable: phase === 'render',
        });
    }

    pause({ notifyGame = true } = {}) {
        if (this.paused) {
            return;
        }

        this.paused = true;
        this.lifecycleVersion++;
        // A paused page must not submit empty RAF callbacks at the display
        // refresh rate. This also applies to loading transitions and results.
        this.cancelScheduledFrame();
        this.lastTimestamp = null;
        this.accumulator = 0;
        this.resetRenderTiming();
        if (notifyGame) {
            this.currentGame?.pause();
        }
        this.schedulePausedInput();
        this.eventBus?.emit('runtime:paused');
    }

    resume({ notifyGame = true } = {}) {
        if (!this.paused || this.faulted || this.disposed) {
            return;
        }

        this.paused = false;
        this.lifecycleVersion++;
        this.cancelPausedInput();
        this.lastTimestamp = null;
        this.accumulator = 0;
        this.resetRenderTiming();
        if (notifyGame) {
            this.currentGame?.resume();
        }
        this.scheduleFrame();
        this.eventBus?.emit('runtime:resumed');
    }

    onVisibilityChange() {
        if (this.disposed) return;
        this.lifecycleVersion++;
        this.lastTimestamp = null;
        this.accumulator = 0;
        this.resetRenderTiming();
        if (this.visibilityTarget?.hidden) {
            this.cancelPausedInput();
            this.cancelScheduledFrame();
        } else {
            this.scheduleFrame();
            this.schedulePausedInput();
        }
    }

    stop() {
        this.lifecycleVersion++;
        this.running = false;
        this.cancelPausedInput();
        this.lastTimestamp = null;
        this.accumulator = 0;
        this.resetRenderTiming();

        this.cancelScheduledFrame();
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.stop();
        this.visibilityTarget?.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.currentGame = null;
        this.errorCounts.clear();
        this.lastErrorReport.clear();
    }
}
