# Welcome v4 — Editorial Bento

Design inspiration: https://21st.dev/ (community bento grids, spotlight cards and gradient buttons). Original scoped CSS/HTML implementation; no copied component code, no React, shader, external font or runtime dependency.

- Single viewport, safe-area padding, responsive compact grid on short portraits and two-column landscape/desktop.
- Three original character portraits, warm editorial hero, visually distinct primary and Open World actions, paired utility controls.
- Existing six action identities, sidebar, legal links and creator attribution preserved. Touch targets are at least 44 CSS px; zoom and unusually small viewports retain a natural scroll fallback rather than clipping content.
- Decoration is pointer-transparent; no new overlay. Reduced-motion preferences respected.
- Source Blade and checked-in static HTML use identical welcome CSS; publication verifies the exact new marker and offline release.
- Local isolated Chromium layout fixture passed 12 viewport sizes (320×480 through 1440×900). This was a CSS geometry fixture with representative content, not a full built application or a physical-device run. Full Chromium/WebKit identity tests and prior CI/release gates remain required, now including hit testing and recorded geometry.

