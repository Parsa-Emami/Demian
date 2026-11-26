# Startup/PWA — PR #76 reconciliation

PR #76 now inherits the latest seven-game `main` tree, rather than replacing
SHA-256 PWA integrity, Phase 11 launch gates, security features and current
six-generation hashed asset retention with stale six-game implementations.

## Integrated changes

- Five original game-only styles and Café Drift CSS are loaded by their game
  module loaders, not via the eager app stylesheet.
- Café Rush and Café Critters load shared After Hours dialog CSS first.
- PWA controller is imported after menu hydration, not before first paint.
- Vite missing-chunk errors show a manual recovery control; no automatic
  refresh interrupts an ongoing ranked run.
- Offline game packs contain the selected game chunks, shared dependencies
  and their game-specific CSS. The core still includes the deferred PWA controller.
- The release workflow validates all seven split chunks and CSS package membership.

## Deployment caveat

Existing versioned hash retention, rollout and rollback checks are preserved.
CI validates headless browsers, not real Android/iOS hardware or a live cPanel host.
