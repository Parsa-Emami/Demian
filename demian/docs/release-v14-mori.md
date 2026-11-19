# Mori in Demian V14

Mori uses Arsal’s pose order, shared male motion family, stride sampling, and velocity-driven jump clips. Mori’s short curly hair, round glasses, blue knit sweater, indigo jeans and cream-soled sneakers come from the supplied character board.

The built-in image generation pass redrew the 24 walk, run and jump poses against Arsal’s locomotion source. A second sheet supplied the directional idle poses, low slide and celebration. The pack sources under `mori/source-v14/` contain the cleaned, transparent poses and the identity reference. The build applies uniform clip scaling and uses the V14 foot pivot. Jump height comes from the game simulation. The normalized boards use the project’s create-game-assets and raster-pipeline guidance for alpha cleanup, pose calibration and review at game scale.

## Rebuild from the checked-in sources

From `demian/`:

```sh
python tools/build_character_pack_v14.py --characters mori
python tools/build_runtime_character_packs.py --characters mori --report /tmp/demian-mori-runtime-packs.json
npm run build:static
```

## Local verification

- V14 art validation passed for 16 characters and 96 atlas variants. Mori ships six variants with 672 named frames per atlas.
- All 781 JavaScript tests and eight PHP character API tests passed. The movement regression compares Mori’s walk, run, takeoff, jump, fall and landing clips directly with Arsal’s.
- Static assets, offline packs, compatible chunks, final release, UI layering, master motion and the pinned project skills passed validation.
- Headless Chromium 156 with software rendering checked the picker portrait, selection persistence, and Mori’s atlas in Dino Run, After Hours, Café Rush and Open World at 1440×900 and in a 390×844 mobile emulation. The browser acceptance also exercised Open World walk and run sampling and Dino Run jump and slide inputs.
