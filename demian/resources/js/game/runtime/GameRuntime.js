const DEFAULT_FIXED_STEP = 1 / 60;

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
        visibilityTarget = typeof document !== 'undefined' ? document : null,
    }) {
        this.inputRouter = inputRouter;
        this.eventBus = eventBus;
        this.fixedStep = fixedStep;
        this.maxFrameDelta = maxFrameDelta;
        this.maxSubSteps = maxSubSteps;
        this.requestFrame = requestFrame;
        this.cancelFrame = cancelFrame;
        this.currentGame = null;
        this.running = false;
        this.paused = false;
        this.accumulator = 0;
        this.lastTimestamp = null;
        this.frameRequest = null;
        this.visibilityTarget = visibilityTarget;

        this.tick = this.tick.bind(this);
        this.onVisibilityChange = this.onVisibilityChange.bind(this);
        this.visibilityTarget?.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    setGame(game) {
        this.currentGame = game;
        this.accumulator = 0;
        this.lastTimestamp = null;
    }

    start() {
        if (this.running) {
            return;
        }

        this.running = true;
        this.frameRequest = this.requestFrame(this.tick);
    }

    tick(timestamp) {
        if (!this.running) {
            return;
        }

        if (this.lastTimestamp === null) {
            this.lastTimestamp = timestamp;
        }

        const frameDelta = Math.min(
            Math.max((timestamp - this.lastTimestamp) / 1000, 0),
            this.maxFrameDelta
        );
        this.lastTimestamp = timestamp;

        if (!this.paused) {
            this.step(frameDelta);
        }

        this.frameRequest = this.requestFrame(this.tick);
    }

    step(frameDelta) {
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
        game.render(alpha, frameDelta);
    }

    pause({ notifyGame = true } = {}) {
        if (this.paused) {
            return;
        }

        this.paused = true;
        if (notifyGame) {
            this.currentGame?.pause();
        }
        this.eventBus?.emit('runtime:paused');
    }

    resume({ notifyGame = true } = {}) {
        if (!this.paused) {
            return;
        }

        this.paused = false;
        this.lastTimestamp = null;
        if (notifyGame) {
            this.currentGame?.resume();
        }
        this.eventBus?.emit('runtime:resumed');
    }

    onVisibilityChange() {
        this.lastTimestamp = null;
    }

    stop() {
        this.running = false;
        this.lastTimestamp = null;

        if (this.frameRequest !== null) {
            this.cancelFrame(this.frameRequest);
            this.frameRequest = null;
        }
    }

    dispose() {
        this.stop();
        this.visibilityTarget?.removeEventListener('visibilitychange', this.onVisibilityChange);
        this.currentGame = null;
    }
}
