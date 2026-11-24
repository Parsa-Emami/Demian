# Demian V6 — The Living Café

## Decision
Five inspectable HTML concept mockups are in concepts.html (not production UI or rendered evidence). Editorial evaluation: Living Café 9.7, Midnight Arcade 8.7, Golden Hour 9.3, Character Universe 9.2, Illustrated Storybook 8.9. These are directional estimates, not measured quality. Living Café chosen, with warm spotlight and selected-character focus. References: https://21st.dev/blog/react-spotlight-effect-components and https://21st.dev/community/components/explore/spotlight-buttons. Implemented with existing CSS/HTML and approved assets, not imported React packages.

## V5 failure
Run 45434674810 job 138589132031 failed Chromium 320x480: creator link y=459.34375 height=44, beyond 480. V6 compact layout uses auto rows, bounded hero, two-column action grid and visually hidden redundant credit caption; the creator link and all legal actions retain 44px targets. Existing browser assertions remain intact. Ordinary tall portrait uses an elastic character scene. Landscape uses two columns.

## Runtime
Selected built-in character is synchronized from the existing CharacterManagerUI renderActiveCharacter path and validated against BUILTIN_CHARACTER_SLUGS; support avatars avoid duplicates. Unsupported records use neutral fallback, not a fabricated selected identity. Existing café interior and world preview are offline core assets. Decorative lighting and idle movement are CSS-only with reduced motion. Existing action routing preserved. No new financial, API, authentication or backend behavior. Live rank/countdown/coupon balance and true articulated idle sprites/audio are not implemented in this change.

## Verification
12 Chromium + 12 WebKit viewport checks remain required; added asset checks and reduced-motion assertion. Physical Android/iOS, exact-SHA green CI, visual acceptance and published Pages verification remain mandatory. Source changes only; generated PWA export is rebuilt by existing build:static pipeline to keep the content fingerprint consistent. Do not hand-edit historical playable output or bypass a failed check. No claim of measured 9.5/10.
