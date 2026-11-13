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
        this.currentGame = game;
        this.accumulator = 0;
        this.lastTimestamp = null;
        this.errorCounts.clear();
        this.lastErrorReport.clear();
        this.resetRenderTiming();
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

    scheduleFrame() {
        if (this.running && !this.paused && !this.visibilityTarget?.hidden && this.frameRequest === null) {
            this.frameRequest = this.requestFrame(this.tick);
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
        if (this.running) {
            return;
        }

        this.running = true;
        this.scheduleFrame();
        this.schedulePausedInput();
    }

    tick(timestamp) {
        this.frameRequest = null;
        if (!this.running || this.visibilityTarget?.hidden) return;
        if (this.paused) {
            // A direct tick (legacy integrations/tests) may still poll gamepad
            // navigation. Normal paused scheduling uses the slower idle timer.
            this.inputRouter.poll?.();
            return;
        }

        const workStartedAt = this.observeWork ? (globalThis.performance?.now?.() ?? Date.now()) : null;
        try {
            const elapsed = this.lastTimestamp === null ? 0 : Math.max(0, (timestamp - this.lastTimestamp) / 1000);
            this.lastTimestamp = timestamp;
            this.inputRouter.poll?.();
            if (!this.canRender()) {
                this.lastTimestamp = null;
                this.resetRenderTiming();
                return;
            }
            if (!this.paused) {
                this.observeFrame?.(elapsed);
                this.step(Math.min(elapsed, this.maxFrameDelta), timestamp);
            }
        } catch (error) {
            this.reportError('frame', error, timestamp);
        } finally {
            if (workStartedAt !== null && !this.paused && !this.visibilityTarget?.hidden) {
                const spentMs = Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - workStartedAt);
                try { this.observeWork?.(spentMs); } catch {
                    // Diagnostic collection must never interrupt gameplay.
                }
            }
            // A single render error must never permanently kill the arcade loop.
            this.scheduleFrame();
        }
    }

    step(frameDelta, timestamp = globalThis.performance?.now?.() ?? Date.now()) {
        const game = this.currentGame;

        if (!game) {
            return;
        }

        this.accumulator += Math.min(Math.max(frameDelta, 0), this.maxFrameDelta);
        let steps = 0;

        while (this.accumulator >= this.fixedStep && steps < this.maxSubSteps) {
            const input = this.inputRouter.snapshot({ consumePresses: steps === 0 });
            game.fixedUpdate(this.fixedStep, input);
            this.accumulator -= this.fixedStep;
            steps += 1;
        }

        if (steps === this.maxSubSteps && this.accumulator >= this.fixedStep) {
            this.accumulator %= this.fixedStep;
            this.eventBus?.emit('runtime:frame-drop', { frameDelta, steps });
        }

        const alpha = this.accumulator / this.fixedStep;
        game.update(frameDelta);
        this.renderDelta += frameDelta;
        this.renderElapsed += frameDelta;
        if (!this.firstRender && this.renderElapsed + .0005 < this.renderInterval) return;
        this.renderElapsed = this.renderInterval ? Math.max(0, this.renderElapsed - this.renderInterval) % this.renderInterval : 0;
        const renderDelta = this.renderDelta;
        this.renderDelta = 0;
        this.firstRender = false;

        try {
            game.render(alpha, renderDelta);
            this.errorCounts.delete('render');
            this.lastErrorReport.delete('render');
            this.observeRender?.(globalThis.performance?.now?.() ?? timestamp);
        } catch (error) {
            this.reportError('render', error, timestamp);
        }
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
        // A paused page must not submit empty RAF callbacks at the display
        // refresh rate. This also applies to loading transitions and results.
        if (this.frameRequest !== null) {
            this.cancelFrame(this.frameRequest);
            this.frameRequest = null;
        }
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
        if (!this.paused) {
            return;
        }

        this.paused = false;
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
        this.lastTimestamp = null;
        this.accumulator = 0;
        this.resetRenderTiming();
        if (this.visibilityTarget?.hidden) {
            this.cancelPausedInput();
            if (this.frameRequest !== null) {
                this.cancelFrame(this.frameRequest);
                this.frameRequest = null;
            }
        } else {
            this.scheduleFrame();
            this.schedulePausedInput();
        }
    }

    stop() {
        this.running = false;
        this.cancelPausedInput();
        this.lastTimestamp = null;
        this.accumulator = 0;
        this.resetRenderTiming();

        if (this.frameRequest !== null) {
            this.cancelFrame(this.frameRequest);
            this.frameRequest = null;
        }
    }

    dispose() {
        this.stop();
        this.visibilityTarget?.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.currentGame = null;
        this.errorCounts.clear();
        this.lastErrorReport.clear();
    }
}
