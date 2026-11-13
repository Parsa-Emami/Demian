# Mobile-03 — Sprite & Memory Lifecycle Optimization

Implementation scope: the **shared `CharacterVisualService` for built-in character PNG/atlas pairs**. No change to sprite artwork, authored frames, score math, backend, or static bundle format. This phase does not claim a real-device memory reduction without Android/iOS measurements.

## Findings before Mobile-03

- `CharacterVisualService` shared decoded `HTMLImageElement` references across Canvas avatars and THREE texture views.
- The cache had one fixed 24 MiB cap; no separate low-/mid-/high-tier budget.
- Concurrent requests for different sprite packs could all decode simultaneously.
- `dispose()` cleared the maps but neither aborted inflight fetch/decode nor prevented a late result from repopulating the cache.
- Pack eviction correctly avoided closing an image while avatars still referenced it; that safety property must remain.
- Existing runtime already requests `lite` for NPCs, `runtime` for balanced active character and `detail` only on a high-tier active character. All existing fallbacks remain unchanged.

## What changed

1. **Tier-aware strong-reference cache.** `SpriteMemoryPolicy.js` sets `8 MiB` / `20 MiB` / `40 MiB` for performance / balanced / high tiers. If `navigator.deviceMemory` exists and reports <= 2 GiB, it caps the cache at 8 MiB; Safari and other browsers without this nonstandard hint default to the existing performance tier. This is a budget for cached decoded-pixel **estimates**, not a process/GPU memory cap.
2. **LRU trimming:** remove oldest cache references after inserting new image packs; keep at least the most recent entry even if that one image exceeds the budget. This avoids invalidating an image that a live renderer may still reference.
3. **Bounded loading:** one concurrent atlas+PNG decode for performance tier, two for balanced/high. `SpriteLoadGate` permits are FIFO and correctly transferred to waiting tasks, never oversubscribed.
4. **Single-flight:** concurrent requests for the same `slug:variant` share the pending load. Runtime fallback order (`detail → runtime → lite → compact → mobile`) and 30-second failed-pair cooldown are preserved.
5. **Safe disposal:** cancel queued work, abort running fetch+image requests, reject stale results after dispose and prevent repopulating the cache. No `ImageBitmap.close()` is called on shared `HTMLImageElement` references.
6. **Game transition:** after leaving Open World, keep only the selected character's cached packs; old NPC images may remain alive in consumers until those consumers dispose, but the global cache stops retaining them.
7. **Instrumentation:** `memorySnapshot()` reports approximate retained bytes, budget, entries, in-flight controllers/requests, decode queue watermark, cache hits/misses, fallbacks and evictions. The opt-in `?deviceQa=1` export and Mobile-01 per-game lab reports include it. No remote telemetry or personal data is uploaded.

## Tests

`demian/tests/js/mobile/SpriteMemoryLifecycle.test.js` tests tier/unknown-memory budgets, decoded pixel size, LRU and oversized singles, no image close, bounded concurrency, queue disposal, same-key deduplication, scene cleanup and stale/disposed loads.

The existing `CharacterLoading.test.js` and `CharacterQuality.test.js` test retry/fallback and source art consistency. GitHub Actions runs all JavaScript tests, release validators, PHP SQLite/MySQL, browser QA and **both mobile emulation profiles**, covering all six games. Device QA captures reference estimates when used physically; actual process RAM, GPU memory, battery and thermal effects still require [Issue #7](https://github.com/Parsa-Emami/Demian/issues/7).

To run:

```bash
cd demian
npm ci
npm run test:ci
npm run build:static
npm run validate:static-assets
npx playwright install chromium --only-shell
npm run benchmark:mobile:ci
DEMIAN_MOBILE_BENCH_PROFILE=low-mobile npm run benchmark:mobile
```

Check `docs/mobile-01/baseline/mobile-*.json`, each game `spriteCache`, and `?deviceQa=1` exports; do not equate that object with whole-process resident memory. For meaningful comparisons, hold the browser, profile and build constant.

## Acceptance and limitations

- No missing character art and no degradation of original source PNG/atlas fidelity.
- Same-key loads share one decode; unrelated loads never exceed the gate limit.
- Cache strong references trim to the tier budget except for a single indivisible oversized image; never force-dispose a live image.
- No new cache entry after disposal, no uncaught rejection on cancelled queued work.
- All existing tests and 6-game mobile lab runs pass; results remain *laboratory evidence only*.
- Do not interpret a reduced cache reference count as guaranteed immediate native/GPU memory release; browser garbage collection can be deferred.
- Device-memory hint is nonstandard, optional and coarsened; it is not reliable evidence of actual RAM. Physical phone tests are required.
- More aggressive changes to actual sprite dimensions/format and verified decoded-image footprint are deliberately deferred until visual and hardware tests prove they do not degrade animation.

## References
- [MDN: HTMLImageElement.decode()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode)
- [MDN: ImageBitmap.close()](https://developer.mozilla.org/en-US/docs/Web/API/ImageBitmap/close)
- [MDN: Navigator.deviceMemory](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory)
- [Mobile-02 asset optimization](../mobile-02/README.fa.md)
- [Mobile-first launch readiness #10](https://github.com/Parsa-Emami/Demian/issues/10)
