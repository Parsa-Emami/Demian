# Demian game room

The lobby uses Demian’s own wordmark and café interior. Two primary actions open the game library and the café. The character picker, weekly rankings and coupon wallet sit directly below the hero, with settings in the header and the legal links in the footer.

| Web game reference | Pattern applied in Demian |
| --- | --- |
| [Poki](https://poki.com/) | Browse a set of games at a glance and launch from a visual tile. |
| [CrazyGames Leaderboards](https://www.crazygames.com/leaderboards) | Give the weekly competition its own entry point. |
| [OFF PLAY](https://devianlabs.com/products/offplay) | Keep the path into a game short on a phone and place a featured play option beside the catalogue. |

The 1400 × 933 WebP at `assets/lobby/demian-at-dusk.webp` is original splash art based on the existing Demian game interior and the project’s main-hall reference photo. The composition keeps the communal table, bookshelf, amber pendants, green tile espresso bar and back seating.

The selector uses actual captures from the seven Demian games. Dino Run leads because its side view gives the clearest view of the café’s furniture and espresso bar. Launching and opening a guide have separate controls.

The game-development router directed the UI and art to `game-ui-ux` and `create-game-assets`. The engine fingerprint is Three.js r185 with Canvas 2D gameplay. The screens use the existing DOM lifecycle and the gameplay captures use the original renderers.

The paired Chromium 390 × 844 measurement on a portable release with service workers blocked measured 4,632 px of overflow in the previous library. The new layout fits all seven cards with zero vertical overflow at that size. The browser checks exercise the game controls, guide toggle and explicit PWA update.

The public catalogue no longer mounts the offline download panel. Worker integrity and cache recovery are checked separately through the worker protocol.

## Cross-browser release check

Step 31 uses the rendered launch buttons and Playwright’s pointer actionability checks. The launch event and playing state are asserted for every game. The 390 × 844 emulated run passed all seven launches, keyboard entry and connection recovery in Chromium, Firefox and WebKit. This follows the DOM navigation and focus flow in the `game-ui-ux` guidance.
