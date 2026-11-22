# Mahyar in Demian V14

Mahyar uses Arsal’s pose order, male movement family, stride timing and velocity-driven jump sampling. His swept-up hair, rectangular glasses, sage crewneck, dark denim and cream-soled sneakers come from the supplied design.

One image generation pass redrew Arsal’s 24 walk, run and jump poses with Mahyar’s design. A second pass produced the eight standing directions, low slide and celebration. The project’s create-game-assets and raster-pipeline guidance informed the transparent cutouts, crop checks and preview at gameplay scale. The checked-in boards use one scale per source family; the V14 builder calibrates each clip against the standing body height and applies the shared foot pivot.

## Rebuild from the checked-in sources

From `demian/`:

```sh
python tools/build_character_pack_v14.py --characters mahyar
python tools/build_runtime_character_packs.py --characters mahyar --report /tmp/demian-mahyar-runtime-packs.json
npm run build:static
```

## Local verification

- V14 image validation passed for all 17 characters and 102 variants. Mahyar has six atlas tiers with 672 named frames per tier.
- All 781 JavaScript regressions and eight PHP character API tests passed. The locomotion test compares the walk, run, sprint, takeoff, jump, fall and landing metadata with Arsal and verifies distinct artwork.
- The static asset, PWA, atomic bundle, UI layer, shared motion, café presentation and pinned skill checks passed. The portable build retains three compatible chunk generations.
- Headless Chromium 156 with software rendering checked Mahyar’s portrait and persisted selection in 1440×900 desktop and 390×844 mobile emulation. Dino Run, After Hours, Café Rush and Open World loaded Mahyar’s atlas. The acceptance run checked Open World walk and run sampling and Dino Run jump and slide with keyboard and emulated touch.
