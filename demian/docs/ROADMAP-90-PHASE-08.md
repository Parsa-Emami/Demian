# Roadmap 90+ · Phase 08 — Unified sprite sheet and animation system

Depends on Phase 07 V2 (PR #93). All 18 V14 built-ins have the same 672 logical frame names and six variants. Preserve one or two authored run-cycle counts rather than dropping poses. Shared travelled-distance driver, fixed playback limits, vertical-velocity jump split (takeoff 12, apex 8, fall 11), 24-frame landing, dedicated slide and .5/.94 pivot. No changes to competitive physics or rules.

JSON contract shared by runtime semantic resolver, timing builder and CI. Dodge resolves to the character's own authored Slide; Crawl resolves to static Crouch as an explicit low-pose fallback, not a new moving crawl or gameplay ability. Unknown/custom/legacy packs retain existing resolution. Preserve identities and accessories. Both Three.js and Canvas quality swaps restore exact fractional loop phase, cycle-aware frame mapping, locomotion state and completed one-shots. Retiming now includes detail variant and publishes low-pose aliases on rebuild.

CI checks 18 x 6 x 672 = 72,576 logical frame references, alpha bounds, hash, pivot, state timing, jump ranges, direction arrays. Reports adjacent silhouette height and center drift, loop seam and foot-anchor delta. Existing reference-first V2 contact sheets and four-layout all-roster browser gate remain. Automated tests check every state and direction, and quality swaps.

Acceptance boundary: original source raster pixels are unchanged. Human artistic correction of limb proportions, line weight and independent crawling/dodging poses remains necessary; metrics do not certify perfect anatomy. CI-derived static output is not a refreshed committed playable directory. No dependency added. Skills: router, create-game-assets. Next: Phase 09 skill leagues.
