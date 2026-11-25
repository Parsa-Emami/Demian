# Demian — current seven-game café arcade

The active mobile-first catalog contains **seven games**: Open World, Dino Run, After Hours, Café Rush, Café Critters, Coffee Crash and Café Drift. Sessions are single-player; competitive leaderboards are asynchronous, not shared live multiplayer.

The authoritative sources are [GameCatalog.js](resources/js/game/catalog/GameCatalog.js), [GameDefinitions.js](resources/js/game/registry/GameDefinitions.js), and the [19-character manifest](public/assets/characters/character-manifest-v4.json). Generated sprite packs and presence in the manifest are **not proof of completed visual/art acceptance**.

## Build and validate

```sh
npm ci
npm run test:ci
npm run validate:final
npm run validate:ui-layers
npm run validate:characters:v14
npm run build:static
npm run validate:static-assets
npm run validate:build
python3 -m http.server 8080 --directory _site
```

Use Node.js 24, Python 3 with Pillow, and the project's lockfile. The tracked `../playable/` folder is a static preview and can be served using `python3 -m http.server 8080 --directory playable` from the repository root. Rebuild it from source only after release validation.

## Backend / production

The Laravel API, MySQL database, verified leaderboard and rewards are separate from GitHub Pages. A passing Pages build does **not** prove live backend readiness, physical Android/iOS acceptance, coupon integrity, or production host capacity. CI runs PHPUnit on SQLite and MySQL as well as browser regression tests. Ranked/reward gates must remain fail-closed pending independent acceptance.

## Current source of truth

- [Phase 0 release stabilization & acceptance](docs/phase0/PHASE_00_STABILIZATION.md)
- [Open PR dependency triage](docs/phase0/OPEN_PR_TRIAGE_2026-11-21.md)
- [Seven-game design standard](docs/game-design/GAME_DESIGN_STANDARD_V1.fa.md)
- [Phase 1: playable onboarding, difficulty guidance and score-policy contract](docs/game-design/PHASE_01_GAME_EXPERIENCE.fa.md)
- [Phase 6: source-backed café Canvas2D visual system and QA](docs/gameplay/PHASE_06_ENVIRONMENT_ART_BIBLE.fa.md)
- [Phase 7: accessible seven-game UX and original procedural audio](docs/gameplay/PHASE_07_UX_AUDIO_ACCESSIBILITY.fa.md)
- [Phase 8: mobile performance, PWA integrity and device QA](docs/gameplay/PHASE_08_MOBILE_PWA_ACCEPTANCE.fa.md)
- [Phase 9: authenticated OTP, fraud appeals and safe financial reward gates](docs/gameplay/PHASE_09_SECURITY_IDENTITY_FRAUD.fa.md)
- [Phase 10: cPanel production architecture, verification and recovery](docs/gameplay/PHASE_10_CPANEL_PRODUCTION_ARCHITECTURE.fa.md)
- [Phase 11 — final QA and controlled go/no-go](docs/gameplay/PHASE_11_FINAL_QA_GO_NO_GO.fa.md)
- [Open visual-art technical debt](docs/technical-debt/TD-ART-001-ART-REBUILD.fa.md)
- [Legacy V14 release notes (archived)](docs/archive/README_V14_legacy_notes.fa.md)
