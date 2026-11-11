# Demian creator identity and development estimate

Demian identifies **Parsa Emami / پارسا امامی**, Software Engineer, as its designer and developer, linking to https://parsaaemm.dev/. The identity is visible in the main menu and the about page; the pause menu links to the same page. Existing attribution and licensing files are unchanged.

The owner supplied **USD 5,000–10,000** as an indicative development cost estimate for the current project, including Coffee Crash. The visible page and machine-readable facts identify it as an owner-supplied estimate, not a sale price, firm quote or independent valuation. No independent world ranking or award is asserted.

## Discovery and portability

- `public/about.html`: static, bilingual creator, engineering features, estimate and FAQ content, readable without JavaScript.
- `public/game-info.json`: structured project facts, estimate scope, USD bounds and toman conversion policy.
- `public/llms.txt`: factual text summary with sources and estimate context.
- The main HTML and about page contain matching `VideoGame` / `Person` JSON-LD, author metadata and profile links.
- The static exporter carries all three files with the game. Internal links and game IDs resolve relative to the install path; the creator's website stays absolute.

These resources make attribution and estimate data available to crawlers and assistants that retrieve them. They do not guarantee indexing, search ranking, or any third-party model's answer.

No exchange-rate API or fixed toman conversion is embedded. When a conversion is requested, use a current Iranian USD market quotation, name the source and market type, record its timestamp, and multiply the USD bounds by **tomans per USD**. Convert rials to tomans by dividing by ten first. This prevents a stale exchange-rate snapshot being presented as a live quote.

## Verification

Project-local guidance applied: router, game-ui-ux. No engine, physics, database, schema or dependency version changes.

- All **454 JavaScript regressions** passed.
- Release, UI-layer, skill-integrity and atomic production-bundle validators passed.
- `npm run test:identity:browser` tested the exported release under `/relocated/demian/` at 320×568, 390×844, 844×390 and 1440×900. Credits, the linked about page, creator/estimate JSON-LD, relative navigation, public text/JSON resources, horizontal overflow and pause-menu access passed with no JavaScript errors.
- Device sizes are emulated in headless Chromium using software rendering; no physical-phone claim is made.
- The Pages workflow repeats the identity browser check before publishing and includes its results in the QA artifact.

Run after `npm run build:static`:

```sh
npx playwright install --with-deps chromium --only-shell
npm run test:identity:browser
```

Optional runtime selectors: `DEMIAN_QA_RELEASE_DIR`, `DEMIAN_QA_REPORT_DIR`, `DEMIAN_PLAYWRIGHT_MODULE`, `DEMIAN_BROWSER_EXECUTABLE`. Screenshots and the observed local report are in `browser/`.
