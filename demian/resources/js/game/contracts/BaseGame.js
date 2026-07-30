/**
 * Lifecycle contract shared by every game hosted by Demian Game Platform.
 *
 * Games own their rules, scene and HUD. Shared platform services are received
 * through the context passed to preload() and enter().
 */
export default class BaseGame {
    async preload(_context) {}

    async enter(_context, _params = {}) {}

    startSession(_params = {}) {}

    applySettings(_settings) {}

    fixedUpdate(_deltaTime, _input) {}

    update(_deltaTime) {}

    render(_alpha, _deltaTime) {}

    resize(_width, _height) {}

    pause() {}

    resume() {}

    async exit() {}

    dispose() {}
}
