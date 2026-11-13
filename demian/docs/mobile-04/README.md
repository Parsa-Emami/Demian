# Mobile-04 — Progressive Sprite Loading & Network Resilience

## Scope and architecture

Mobile-first Demian remains an **atomic static web game**. Gameplay starts locally without a Laravel connection; competitive scoring and weekly leaderboards are a separate API feature. Mobile-04 reduces *optional sprite network contention*, preserves the already validated Mobile-02 asset set, and adds robust recovery from transient sprite loading errors. It **does not** enable offline ranked submissions, change the Vite chunk layout, or reduce source sprite fidelity.

### Data-aware priority and progressive loading

- **Critical path:** the selected playable character loads immediately with a high-priority PNG hint; offline status does *not* block it because previously cached files may still work.
- **Optional path:** background NPC sprite hydration starts only after the player character and main scene are ready.
- **Save-Data / 2G / slow-2G:** skip optional NPC downloads. The player remains playable.
- **3G:** hydrate at most one optional NPC.
- **4G / absent Network Information API (Safari):** preserve existing tier-dependent optional NPC budget.
- **Hidden page / offline:** defer new optional NPC downloads and abort obsolete optional sprite requests; do not abort active foreground content.
- On `online`, `visibilitychange` or `navigator.connection.change`, reassess the policy and resume NPC hydration if allowed. Listeners are cleaned up on world disposal.
- A foreground request joining an in-flight optional download **promotes the shared operation**; subsequent scene cancellation must not abort that player's sprite.
- During scene switch, an `AbortController` cancels superseded optional requests, including those queued behind the Mobile-03 bounded decode gate. Cancelled work is **not** misclassified as a broken pack and does not trigger further fallback downloads.

`navigator.connection` is limited-availability and treated only as an optional, coarsened hint. Its absence is not an error. `navigator.onLine` does not prove origin reachability; it influences optional traffic only, never mandatory player loads.

### Error recovery

- Download retry covers transient **HTTP 408 / 429 / 5xx**, interrupted network/image fetches and timeouts.
- Retry uses at most **two attempts**, with a capped, cancelable backoff, avoiding infinite loops and wasteful cellular traffic.
- **404 and invalid-art data** are not retried; existing `detail → runtime → lite → compact → mobile` visual fallback remains available.
- When the network reconnects, transient failed-pair cooldowns are cleared. Permanent missing assets retain their protection against repeated downloads.
- Atlas JSON continues to use `cache: 'no-cache'` so its embedded image revision stays synchronized with the versioned PNG. This permits normal 304 revalidation and avoids an old atlas/new PNG mismatch.
- HTMLImageElement `fetchPriority` is a **hint only**: `high` for required player images and `low` for optional NPCs. Unsupported browsers simply ignore it.
- The existing Mobile-03 single-flight image decode and LRU decoded reference budget are preserved.
- **Café tiles:** reuse the distance-sorted, viewport-only `CafeArtStream` rather than creating a second fetcher. With Save-Data/2G, hidden or offline the game keeps its lightweight preview and skips optional detailed tiles. On 3G, load at most two detailed tiles (one concurrent request). Network changes cancel obsolete tile fetches and refresh the view/cooldown; new tiles resume when conditions improve. Existing decoded tile and concurrency budgets remain enforced. Transient tile errors receive one bounded retry before normal cooldown.

### Tests and diagnostics

Unit tests: `tests/js/mobile/MobileNetworkResilience.test.js` covering Save-Data, 2G, 3G, hidden/offline, missing API fallback, HTTP classification, retry, cancellation during backoff, optional scene cancellation, single-flight promotion, reconnect cooldown and critical loads. Additional `tests/js/mobile/CafeArtNetworkPolicy.test.js` exercises preview-only and 3G budgets, tile cancellation, and reconnect.

Real browser integration: `npm run test:mobile-network:browser` serves the **optimized production `_site`**, emulates touch + 2G Save-Data, boots to menu and launches Open World with **one active player, no optional NPC downloads**. It then simulates a 4G connection change, requires optional NPC hydration to resume without reload, and fails on uncaught JavaScript exceptions. JSON evidence: `docs/mobile-04/browser/save-data-resume.json`. These tests remain browser emulations, **not real-phone proof**.

The full existing GitHub Actions pipeline also runs unit tests, static build, integrity validation, Coffee Crash/identity/Device QA browser tests, both 6-game mobile performance profiles, and Laravel SQLite/MySQL.

### Run locally

```bash
cd demian
npm ci
npm run test:ci
npm run build:static
npm run validate:static-assets
npx playwright install chromium --only-shell
npm run test:mobile-network:browser
npm run benchmark:mobile:ci
DEMIAN_MOBILE_BENCH_PROFILE=low-mobile npm run benchmark:mobile
```

### Acceptance and caveats

- All six games remain playable, no blank canvas or critical missing assets.
- Foreground sprites continue to load and decode when the browser reports offline; high priority cannot be canceled by optional background cancellation.
- Optional queued and active requests are canceled safely and do not trigger infinite fallback/retry.
- Existing visual scale, frame integrity, CPU/GPU pipeline and score verification are unchanged.
- The mechanism does **not guarantee** smaller initial transfer: Mobile-01 network bytes and cold/warm boot timings must be compared on the same test profile. Further changes to the format/size of environment tiles and PWA offline caches belong to later dedicated PRs.
- Actual radio, cellular handoff, 15-minute thermal/battery, WebKit/iOS memory and native touch performance still need physical Android/iPhone testing ([Issue #7](https://github.com/Parsa-Emami/Demian/issues/7)).
- Nested hosting paths may still exhibit the known independent font problem ([Issue #12](https://github.com/Parsa-Emami/Demian/issues/12)).

## Sources

- [MDN: NetworkInformation effectiveType](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/effectiveType)
- [MDN: Save-Data](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData)
- [MDN: AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [MDN: Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)
- [MDN: HTMLImageElement.fetchPriority](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/fetchPriority)

Related roadmap: [Issue #10](https://github.com/Parsa-Emami/Demian/issues/10).
