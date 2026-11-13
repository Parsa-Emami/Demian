# Mobile-09 — selective offline gameplay and installable PWA

## Delivery contract

The static HTTPS/PWA frontend supports six games as local practice when the player has explicitly downloaded their current-version package. Each package includes a shared atomic app shell, local fonts, essential cafe previews, small character sprites, and a per-game selection of additional art. High-resolution optional tiles and character variants remain online-only when omitted. This is intentionally **not** a download of the complete high-resolution archive. Scores from offline practice are never represented as verified international rankings.

No offline account creation, leaderboard update or verified server score acceptance is claimed. The service worker never handles API credentials or POST. The owner-bound replay already saved by ArcadeLeaderboardService survives a reload; an online event retries it only from the menu. The server remains the authority for all rankings.

## Architecture and storage policy

- **Reproducible release:** tools/export_static.mjs generates offline-packs.json and service-worker.js for one SHA-256 content fingerprint of all required assets. Changing art without changing JS also changes the service worker version.
- **Explicit downloads:** the initial worker install caches only offline.html, the 192/512 icons, and the small pack manifest. It never automatically downloads the game bundle or all sprites.
- **Shared core:** one version-specific cache contains the HTML, atomic JavaScript/CSS, Vazirmatn WOFF2 fonts, characters.json, character registries, cafe preview, and per-character lite atlas and sprite pairs. Additional per-game art lives in separate versioned caches.
- **Six individual packs:** open-world, dino-run, after-hours, cafe-rush, cafe-critters and coffee-crash. Each is independently downloadable/removable from the game-selection screen; they share one copy of common assets.
- **Bounded, transactional packages:** the build fails if any complete pack exceeds 96 MiB. Downloads are explicit, validate every same-origin relative path, and commit a readiness marker only after all files are successfully cached. Failed partial caches are deleted and never advertised as playable.
- **Network-first for normal requests:** offline assets only serve as a fallback when a network request fails. Authorization-bearing requests, credential-bearing GETs, /api/ paths and all mutations are bypassed completely. Offline navigation requires an already complete shared core; otherwise the existing informative offline page is displayed.
- **Safe updates:** new workers wait for an explicit menu action and are not allowed to reload ongoing sessions. Prior release caches are removed after activation; players must re-download offline packages for a new release so incompatible revisions cannot mix.
- **Storage budget and visibility:** the UI shows progress and currently installed games. It uses browser storage estimates and available quota when supported, and may ask for persistent storage only after an explicit click. iOS/Android may deny persistence or evict all site data; no permanence guarantee is made.
- **Installability:** the portable manifest, standalone display mode, icons, and existing iOS touch icon/meta settings remain. Android uses the native beforeinstallprompt flow only when the browser supplies it; iOS shows Share → Add to Home Screen instructions.

## Acceptance commands

Run these from the demian directory:

~~~sh
npm ci
npm run test:ci
npm run build:static
npm run validate:static-assets
npm run validate:build
npx playwright install chromium --only-shell
npm run test:mobile-pwa:browser
npm run test:mobile-09:browser
~~~

The new Playwright test uses a real headless Chromium browser at a relocated hosting subpath. It downloads all six individual packs from the UI, verifies the shared-core CacheStorage isolation, disables networking, reloads from the offline shell, launches every game in local practice mode, reconnects, removes all six packs, and verifies the expected safe offline fallback. Unit tests cover six manifest entries, size bounds, invalid/missing assets, worker progress/errors and no API caching. CI uploads the evidence under docs/mobile-09/browser.

## Release and safety gates

1. Use HTTPS, keep the static release atomic, and set HTML, worker and offline-packs.json to revalidate on every deployment. GitHub Pages ignores Apache .htaccess; verify real hosting headers.
2. Test cold/warm boots, switch between characters, rotate and background the page, explicitly deny storage quota, update a waiting worker while a ranked run is open, and verify pending scores remain recoverable. Real operating-system eviction is always possible.
3. Physical Android Chrome and iOS Safari installation, WebKit storage and thermal/frame performance are **not** established by emulated Chromium tests. These remain mandatory Mobile-12/#7 hardware tests.
4. The Laravel/MySQL backend and real HTTPS deployment remain Mobile-11 responsibilities. Only Dino Run has a server replay verifier; unverified mini-games stay practice-only.
5. CacheStorage contains public static assets only. Never cache secrets, private players, recovery links, API responses or client-claimed ranked scores.

References: MDN Progressive Web Apps Caching, MDN Making PWAs installable, Demian issues #7 and #10.
