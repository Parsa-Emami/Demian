# Demian controls and motion feedback

## Persistent development reference

The project now includes all 76 specialist skills and the router from [awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills), pinned to `184b72be02884f782a0058f2eeae2ce4277453e4`. `AGENTS.md` makes the router and relevant specialist guidance the starting point for every future Demian task. The files remain unchanged, retain Apache-2.0 attribution, and are checked against the SHA-256 lock by `npm run validate:skills` and GitHub Actions. Updating upstream is deliberate so a future upstream edit cannot silently alter the project workflow.

Applied guidance: router (identify the actual Canvas/three.js engine and installed version), input-systems (semantic actions, physical keys, edges, radial deadzone, rebinding and context isolation), game-feel (bounded event feedback independent of collisions), camera-systems (deadzone, damped look-ahead and teleport reset), game-ui-ux (adaptive prompts, focus navigation, touch targets), and create-game-assets (reuse the established style, preserve identity and validate shipped animation references).

## Playable changes

- Physical WASD works with Persian keyboard text. Arrow Down moves through the cafe without accidentally starting a slide; runner Arrow Down still ducks.
- Dash (X), backward dodge (C) and slide (G) work through keyboard, the touch action tray and a standard-mapped gamepad. Their physical durations are 0.42/0.62/0.58 seconds. A shared 0.16-second recovery prevents stacking. A 0.16-second input buffer bridges short landing/recovery windows and expires across longer waits.
- The shipped atlas manifests explicitly map dash to run and dodge to slide. These are deliberate existing artwork fallbacks, not newly drawn animations. Impulse clips are sampled by physical action progress; character proportions, textures, footsteps, collisions and the cafe layout remain governed by their existing contracts.
- Native Canvas feedback adds restrained dust, takeoff/landing rings, dash wind strokes and social-action sparks. Only the controlled actor emits, the particle count is capped at 48, and decorative effects are hidden with reduced motion. No camera shake, character stretching or ghost silhouettes are added.
- The follow camera holds a small deadzone, looks ahead with a capped, damped lead and resets after a teleport or character change. Reduced motion removes prediction.
- Settings include saved, conflict-checked key bindings and reset. Arrow keys, Escape and the existing F/R camera shortcuts remain reserved. Storage failure falls back to session-only controls.
- Standard gamepads have an 18% radial deadzone, normalized d-pad diagonals, queued press edges, neutral gating after blur/reconnect/context changes, pause/resume and menu focus navigation. Prompts follow the active input source. Pointer holds support more than one finger on the same action; an additional joystick pointer cannot steal the existing drag.

## Controls

| Action | Default keyboard | Standard gamepad |
|---|---|---|
| Move | WASD / arrows | Left stick / d-pad |
| Run | Shift | RB |
| Jump / hold higher | Space | A |
| Dash | X | X |
| Backward dodge | C | B |
| Slide | G | Left stick click |
| Interact | Enter | Y |
| Character ability | Q | LB |
| Wave / celebrate | V / O | LT / RT |
| Speak | H | Right stick click |
| Map | M | View |
| Pause | Escape | Menu |

In menus, directions change focus, A selects (and cycles a focused select field), B returns and Menu pauses/resumes. Gamepad mapping is the browser standard mapping; physical legends vary by manufacturer. Custom remapping currently applies to the keyboard. Gamepad and phone behavior is tested with browser emulation, not physical hardware.

## Reproduce validation

Run `npm ci`, `npm run test:ci`, `npm run validate:skills`, `npm run validate:final`, `npm run validate:ui-layers`, `npm run validate:characters:v14`, `npm run build:static` and `npm run validate:build` from `demian/`.

Run `npm run test:controls:browser` with Playwright installed, or set `DEMIAN_PLAYWRIGHT_MODULE` and optionally `DEMIAN_BROWSER_EXECUTABLE`. The script serves the static build on loopback, tests desktop and phone layouts, Persian physical keys, action timing/feedback, landing buffering, a simulated standard gamepad, modal pause/resume, binding conflict/persistence/reset and touch dodge. It also executes the three movement actions for all ten cafe characters on the desktop profile. Reports and screenshots are written next to this file. `browser-checks.json` records observed results; no physical-device frame-rate claims are made.

Settings-only visual regression (`npm run test:controls:browser -- --settings-only`) also checks that temporary world information toasts do not cover the paused settings panel.

The old roster fallback test now stubs a failed fetch instead of opening a connection to an external test domain.

Observed validation: 338 JavaScript tests passed; 77 skill packages / 207 pinned files verified; all 60 atlas variants passed. Desktop (1440×900) and phone (390×844) browser profiles passed gameplay and settings-layout checks with zero page errors, failed asset responses or runtime errors. The desktop run exercised dash, dodge and slide for each of the ten characters. See the JSON reports for individual results.
