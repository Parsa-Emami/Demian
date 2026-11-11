# Demian creator attribution

The player-facing main menu contains one centered credit: **طراحی و توسعهٔ بازی**, followed by **parsaaemm**, linking to https://parsaaemm.dev/. The about/cost page and its menu and pause links have been removed.

Creator information remains available outside the rendered interface in the HTML author / Person / VideoGame metadata, `public/game-info.json` and `public/llms.txt`. The verified LinkedIn and GitHub profile links identify Parsa Emami. Instagram and Telegram URLs are not guessed and can be added after the owner supplies confirmed links.

The development estimate and toman conversion policy are retained in `resources/game/project-business-context.json`. The file is not imported by browser code, copied to `public/`, or included in the static export. No pricing or commercial description is published in the current HTML, creator JSON or text summary. Removing a file from the deployed web app does not make a public Git repository or its history confidential.

## Static export

The exporter carries the creator JSON and text summary with the game, and removes a stale `about.html` when reusing an export directory. Relative metadata links work when the game is hosted under a different path.

## Verification

Project-local guidance applied: router, game-ui-ux. No engine, dependency, physics or database changes.

- The browser check covers 320×568, 390×844, 844×390 and 1440×900 under a relocated `/relocated/demian/` base path.
- It verifies the centered credit, website hyperlink target, creator metadata and LinkedIn link; removal of pricing from published metadata/text; removal of the about page and pause-menu link; and absence of horizontal overflow and JavaScript errors.
- The portfolio navigation target is intercepted in the browser test so external website availability does not gate a game release.
- Screenshots and the observed report are in `browser/`. Phone dimensions are emulated in headless Chromium; software rendering is used.
- Pages CI repeats the identity check before publication. Full JavaScript regressions plus release, UI-layer, skill-integrity and atomic-bundle checks are also run.

After `npm run build:static`:

```sh
npx playwright install --with-deps chromium --only-shell
npm run test:identity:browser
```

Optional runtime selectors: `DEMIAN_QA_RELEASE_DIR`, `DEMIAN_QA_REPORT_DIR`, `DEMIAN_PLAYWRIGHT_MODULE`, `DEMIAN_BROWSER_EXECUTABLE`.
