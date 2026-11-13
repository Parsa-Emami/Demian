# Mobile-07 — Production Hosting, PWA, Font & Security Review

## Deliverables

- **Relocatable static release**: Vite `base: './'` emits relative CSS font paths for both domain root and nested folders. The six existing self-hosted **Vazirmatn** Arabic/Latin WOFF2 files (400/700/900) remain in the release; license is `docs/licenses/Vazirmatn-OFL.txt` (SIL OFL 1.1). The café display title also uses Vazirmatn. No Google Fonts or CDN dependency.
- **Controlled PWA**: a per-build `service-worker.js` with a content-derived version, a lightweight self-contained `offline.html` and existing portable manifest/icons. Only the offline fallback/icons are precached.
- **Safe update**: a new SW waits; an accessible banner appears **only in the menu** and updates only after the player taps the button. Never forcibly reload an in-progress ranked game.
- **API isolation**: no Service Worker response cache for `/api/`, Authorization requests, replay submissions, player tokens, `build/` bundles or character sprite/atlas assets. Offline fallback does not simulate successful score submissions or promise offline ranked gameplay.
- **Hosting headers**: `_site/.htaccess` for Apache/LiteSpeed with `nosniff`, frame/referrer/permission restrictions, revalidatable HTML/manifest/SW, immutable content-hashed CSS/JS/WOFF2. GitHub Pages ignores .htaccess and uses its own cache policy.
- **Frontend security review**: replaced the only boot error path that interpolated `error.message` into `innerHTML` with inert `textContent` DOM nodes, preventing markup execution through untrusted error messages.
- **Existing backend controls retained**: `LimitArcadePayload` rejects payloads >256KiB and sets `no-store`; CORS requires explicitly configured origins, bearer tokens are SHA-256 hashed server-side, registration/completion requests have route throttling and server replay verification. This is not a full security penetration test.

## Deploy to a shared host (Apache / LiteSpeed)

1. Build `demian/_site` in CI. Upload **its contents**, including hidden `.htaccess`, directly to the HTTPS domain's document root (`public_html`) or a subdirectory such as `public_html/demian`. Do not upload the Laravel project as a static webroot.
2. Confirm TLS/HTTPS is active. Service Workers are unavailable on ordinary HTTP sites (except secure localhost contexts). If the hosting control panel forbids `Header` directives in .htaccess, configure equivalent response headers in its server/CDN settings.
3. Use a **staged upload and atomic document-root pointer switch** where the provider supports it. Do not delete the existing `build/assets` mid-upload: even with an atomic JavaScript bundle, partial FTP overwrites can momentarily break the site. Prefer managed Pages release publishing if atomic switching isn't available.
4. Confirm `https://your-domain.example/demian/` (including the trailing slash) returns HTML, `manifest.webmanifest`, `service-worker.js`, `offline.html`, all six WOFF2 files and icons. Root domain is equally supported.
5. The game and menu run **without** a Laravel server. For verified ranked scores, weekly leaderboard and profiles, deploy a **separate HTTPS Laravel API** on an appropriate PHP host/VPS, migrate the database, enable backups and log rotation, configure `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL`, a durable `APP_KEY`, DB credentials and strict `DEMIAN_ARCADE_ALLOWED_ORIGINS`. Build the frontend with `DEMIAN_ARCADE_API_URL=https://api.your-domain.example/api/v1/arcade`; never embed secrets in that URL.
6. Smoke check: GET `/api/v1/arcade/rules` and `/api/v1/arcade/leaderboards/dino-run?period=weekly`. Registration and replay submission must be authenticated/verified, not accepted based only on client high scores. If the API is not deployed, games operate in practice/local mode rather than online ranked mode.
7. Submit release to CI and check the artifact and hosting headers. Test offline open, restored connectivity and deliberate PWA update from menu. Invalidate service-worker registrations before switching hostname/scope in a controlled migration.

**Cache policy:** `index.html`, `service-worker.js`, `manifest.webmanifest`, and `offline.html` must revalidate. Hashed CSS, JS and WOFF2 can cache long-term. Other versioned-by-query image/atlas assets revalidate; PWA does not precache them. This avoids a stranded old shell pointing at deleted hashed game chunks.

## Production verification

- `npm run test:ci`
- `npm run build:static`
- `npm run validate:static-assets` (includes `validate_pwa_release.mjs` CSS WOFF2 checks)
- `npm run test:mobile-pwa:browser` (headless Chromium at **root** and **nested path**, loads all six font variants, verifies SW install, cache exclusion, offline fallback and reconnect)
- Existing production and backend CI gates (Coffee Crash, Device QA, Mobile-04, Mobile-05, six-game benchmarks and PHP SQLite/MySQL).

Browser emulation does not verify an actual provider's Apache overrides, TLS, reverse proxy or browser support across iOS devices.

## Open issues and limits

- [#12](https://github.com/Parsa-Emami/Demian/issues/12): can be closed only after successful root/nested font network verification in CI; physical iOS checks remain in #7.
- [#7](https://github.com/Parsa-Emami/Demian/issues/7): **requires physical** Android and iOS evidence; do not close on browser emulation. See `DEVICE-QA-CHECKLIST.md`.
- Client bearer token resides in origin-scoped localStorage: a successful same-origin XSS or compromised build can access it. This release hardens the identified boot error HTML sink, but does not claim exhaustive XSS protection. Enforce reviewed dependencies, HTTPS and strict API CORS; a CSP policy should be deployed only after eliminating/nonce-hashing existing inline scripts and testing game startup.
- Weekly ranked leaderboard currently covers the verified `dino-run` backend; extending ranked scoring to every mini-game, production abuse controls and identity/privacy flows are separate work. Neither an icon/manifest nor PWA installation implies those backend features are live.
- Privacy: avoid collecting phone numbers or Instagram handles before implementing explicit consent, retention, and deletion controls. The current API only needs a display name and random token; minimize PII.
- This release is **PWA-ready with an offline help page**, not a fully offline playable game.

## Sources

- [Vite relative base paths](https://vite.dev/guide/build.html#relative-base)
- [web.dev PWA caching strategy](https://web.dev/learn/pwa/caching)
- [MDN Service Worker updates](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting)
- [Vazirmatn OFL](https://github.com/rastikerdar/vazirmatn)
