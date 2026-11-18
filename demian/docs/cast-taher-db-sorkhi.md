# Taher DB and Sorkhi

The original reference sheets supplied with the character request are recorded in each character’s reference manifest with their SHA-256 hashes. The playable release uses cropped artwork from these sheets. Source maps isolate the front, three-quarter, side and rear poses and the motion silhouettes. The V14 tools build directional clips and pack the device variants around the shared foot anchors.

The pose sets use the supplied idle, walk, run, jump and victory art. The low slide comes from the leaned pose with its torso rotated around the hip. The upper body keeps its facing during stride changes. North diagonals share the authored rear view. Both characters use the existing ground runner physics.

Build the assets from the application directory with the art requirements installed.

```sh
python3 tools/prepare_cast_sheet_sources_v14.py
python3 tools/build_character_pack_v14.py --characters taher-db sorkhi
python3 tools/build_runtime_character_packs.py --characters taher-db sorkhi --report /tmp/cast-runtime-packs.json
npm run build:static
npm run validate:characters:v14
node tools/check_added_cast_v14.mjs
```

The browser check selects both players from their portraits, reloads to verify selection persistence, then checks the V14 clips in Dino Run, After Hours, Café Rush and Open World. It exercises jump and slide with touch at 390 × 844 and with keyboard at 1440 × 900. Chromium runs headless with phone dimensions and touch emulated.
