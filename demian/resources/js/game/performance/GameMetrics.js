export default class GameMetrics {
    constructor({ eventBus, telemetry, clock = () => performance.now() }) {
        this.subscriptions = [
            eventBus.on('application:boot-timing', () => telemetry.emit('menu_ready', { durationMs: clock() })),
            eventBus.on('game:first-playable-frame', ({ gameId, durationMs }) =>
                telemetry.emit('game_load', { game: gameId, durationMs })),
            eventBus.on('game:load-failed', ({ gameId }) => telemetry.emit('game_error', { game: gameId })),
        ];
    }
    dispose() {
        this.subscriptions.forEach(unsubscribe => unsubscribe());
        this.subscriptions = [];
    }
}
