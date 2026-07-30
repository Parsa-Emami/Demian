# Demian Game Platform — Phase 1

Phase 1 is a behavior-preserving refactor of the current arcade world. It creates the platform seams required by Café Demian and future games without creating a second renderer or duplicating the game loop.

## Runtime ownership

```text
GameApplication
├── RendererService       one THREE.WebGLRenderer
├── GameRuntime           one fixed-step loop (60 Hz)
├── InputRouter           context-aware physical/virtual input
├── GameRegistry          lazy game modules
├── AnimationService      Anime.js shell/HUD adapter
├── PerformanceProfile    shared device capability profile
└── active game
    └── OpenWorldGame     current scene, camera, world and characters
```

`GameApplication` is the composition root. A game receives platform services through an immutable context and cannot create another application runtime.

## Lifecycle contract

Every game follows `BaseGame`:

```js
async preload(context) {}
async enter(context, params) {}
fixedUpdate(deltaTime, input) {}
update(deltaTime) {}
render(alpha, deltaTime) {}
resize(width, height) {}
pause() {}
resume() {}
async exit() {}
dispose() {}
```

The current world is now `games/open-world/OpenWorldGame.js`. Its static appearance, character controls, camera behavior, adaptive quality, NPC updates and post-processing are preserved.

## Fixed-step loop

`GameRuntime` accumulates frame time and advances game rules at `1 / 60` seconds. Rendering remains frame-rate driven and receives an interpolation alpha. Catch-up work is capped to avoid the spiral-of-death on slow devices.

Transient input is consumed only when a fixed update actually runs, so a fast render frame cannot discard a jump or action press.

## Input contexts

`InputRouter` translates keyboard, touch buttons and the virtual stick into semantic actions. Included contexts:

- `MENU`
- `OPEN_WORLD`
- `TETRIS` (contract ready for Phase 3)
- `PAUSE`

For example, Space becomes `jump` in Open World and `hardDrop` in Tetris. Virtual controls use event delegation, allowing later game-specific control layouts to be mounted without rebuilding the input system.

## Anime.js boundary

Anime.js is isolated behind `AnimationService`. Games use the service for shell/HUD motion and never import the library in domain logic. The service loads the pinned Anime.js 4.5.0 ESM build from the documented jsDelivr CDN and honors reduced-motion. A WAAPI fallback keeps gameplay available if the CDN cannot be reached.

## Adding a game

1. Create a class extending `BaseGame`.
2. Add a lazy loader to `registry/GameDefinitions.js`.
3. Add or register its input context.
4. Keep game-specific scene, systems and HUD inside its folder.
5. Use shared services from context; do not create a renderer or loop.

```js
'my-game': {
    title: 'My Game',
    inputContext: 'MY_GAME',
    orientation: 'landscape',
    loader: () => import('../games/my-game/MyGame.js'),
}
```

## Validation

```bash
npm run test:js
npm run build
php artisan test
```

Delivery verification:

- JavaScript syntax validation passed for every file under `resources/js` and `tests/js`.
- `npm run test:js` passed all 9 unit tests.
- The Vite build and Laravel test suite still need to be run in an environment where the lockfile package mirror and Composer `vendor/` dependencies are available. The delivery environment could not resolve the lockfile's `mirror-npm.runflare.com` tarballs and did not contain `vendor/autoload.php`.
