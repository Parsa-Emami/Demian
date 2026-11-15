# Phase 4 — Step 18: lossless artwork and resource optimization

## Baseline and engineering constraints

Repository audit (15 Nov 2026, before this step) found 752 checked-in image files and ~1.08 GB of image bytes across all tracked paths. That figure is **source-repository inventory**, not an HTTP download or a production release size: the tracked \`playable/assets\` tree mirrors substantial portions of \`demian/public/assets\`. Do not remove either Git tree without separately migrating the static publishing process. Source art, historical packs and desktop sheets are already filtered from generated static releases by Mobile-02's \`release_asset_policy.mjs\`.

The playable production renderer is Canvas2D. A single Vite/Rolldown atomic JS bundle is intentionally retained because the previous dynamic game-chunk release caused stale-chunk loading failures on GitHub Pages. Changing to arbitrary route-based code splitting would undo a deployment safety invariant and is **not** part of this step.

### What actually changes

1. **Pixel-perfect image compression:** During \`npm run build:static\`, the release-only Python/Pillow optimizer evaluates each active character's \`runtime\` and \`detail\` PNG. A lossless WebP is accepted only if it preserves RGB and alpha for *every decoded pixel*, matches atlas dimensions and is at least 2% smaller than its PNG. Non-beneficial conversions are discarded. Old PNG and all source art in the repository remain unmodified. The accepted release contains only one image per active atlas variant, with the atlas \`meta.image\` and content SHA-256 \`imageRevision\` updated atomically. The optimizer emits \`sprite-optimization-report.json\` with actual input/output/saved byte counts, and the release validator independently enforces the new references and absence of duplicates.
2. **No arbitrary atlas paths:** The sprite service accepts a WebP only when the atlas declares the precise same character/version/variant filename as its expected PNG, differing solely in the file extension. It rejects other names and external paths before any image request. Existing development and legacy PNG atlases continue working unchanged. The cache-busting revision always follows the current atlas.
3. **Network-aware lazy image fetching:** Existing deferred game and foreground sprite loading remains demand-driven; the background NPC loader still uses its bounded 1–2 request/decode queue and late-request aborts. When users explicitly enable Save-Data or have a 2G connection, even foreground high-quality player requests first use the genuine lightweight \`lite\` atlas instead of fetching full \`detail\`. Normal-network image selection and all game physics/replay scoring stay unchanged. No speculative downloading of the entire roster is introduced.
4. **Memory and texture lifecycle:** Existing 8/20/40 MiB tier budgets are retained; they account only for strong references to decoded sprite pixels (not GPU, resident process or battery usage). Existing LRU eviction, scene-transition eviction, abortable prefetch, tile stream budgets and per-scene \`dispose()\` are preserved. New stress tests switch among six characters 180 times and verify the cache stays bounded and all listeners/references are dropped after disposal.
5. **Adaptive resolution:** Existing tier-aware player/NPC atlas variants, 30/60Hz presentation, canvas resolution ceilings and LOD tile streaming remain active. The lossless transcode does **not** modify source image dimensions, sprites, animation geometry or perceived sharpness. Source-renderer scaling is not unnecessarily changed.
6. **Fonts:** Existing six locally hosted open-source Vazirmatn WOFF2 subsets (Arabic and Latin, 400/700/900), \`font-display: swap\` and Unicode ranges remain. These are small compared with sprite data; duplicating/substituting fonts would worsen correctness for Persian text.
7. **Reliability:** The existing retry policy retries only transient 408/429/5xx/timeout/network failures, not malformed atlases or 404. Missing WebP with a matching signed atlas is a clear load failure and triggers the existing variant fallback, never an untracked cross-origin URL or a silently mismatched texture.
8. **Deployment:** GitHub Pages release is still one atomic JS chunk, with a content-derived service worker version and optional/offline \`lite\` art packs. WebP conversions affect only \`runtime\`/\`detail\`; offline core uses original PNG lite packs, with no new offline download burden.

## Validation

- Node tests: precise path policy, WebP/PNG URL resolution and cache revision, malicious atlas rejection, Save-Data/2G priority and 180-round LRU/owner lifecycle.
- Pipeline regression: a temporary generated PNG fixture is encoded to WebP and checked for all RGBA pixel equality, SHA revision, preservation of geometry and **measured** positive byte savings. Production CI already installs Pillow.
- Existing full \`npm run test:ci\`, character-art validators, \`npm run validate:final\`, \`npm run build:static\`, \`npm run validate:static-assets\`, \`npm run validate:build\`, browser/PWA/offline and mid/low phone benchmarks remain required; backend SQLite and MySQL suites guard scoring and prize behavior.

### Reporting and interpretation

Run \`npm run build:static\` in a Pillow-enabled environment and inspect \`demian/_site/sprite-optimization-report.json\`. The \`savedBytes\` and \`savingsFraction\` fields describe an **actual transformed subset** of character artwork; they are not claims that every phone will download that amount or that decoded/GPU memory decreased. Inspect \`demian/docs/mobile-02/release-asset-report.json\` to compare source/deployed bytes. The per-character runtime atlas is loaded **only if that character is used**, so a smaller export does not imply proportional improvement to first load. A slow link with Save-Data should request lite art first.

### Release boundaries

- Physical iOS/Android thermal/energy tests and long-run GPU memory traces require real devices. Chromium CI cannot assert real-world battery improvements or guaranteed 60 FPS.
- Duplicate \`playable/\` source files and historical Git objects are not deleted. Migrating Git storage, preserving Pages URLs and any future content-hash CDN migration are separate projects.
- No backend, prize issuance, wallet, coupon, leaderboard, game rule or replay-verification changes. Release is safe to revert by reverting this one merge.
