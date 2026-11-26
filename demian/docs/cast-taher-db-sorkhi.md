# Original Taher DB and Sorkhi release

The [current motion release](release-v14-taher-sorkhi/README.fa.md) includes the Arsal-based redraw and browser comparison.

The original reference sheets supplied with the character request are recorded in each character’s reference manifest with their SHA-256 hashes. The playable release uses cropped artwork from these sheets. Source maps isolate the front, three-quarter, side and rear poses and the motion silhouettes. The V14 tools build directional clips and pack the device variants around the shared foot anchors.

The pose sets use the supplied idle, walk, run, jump and victory art. The low slide comes from the leaned pose with its torso rotated around the hip. The upper body keeps its facing during stride changes. North diagonals share the authored rear view. Both characters use the existing ground runner physics.

The project router directed this work through the create-game-assets workflow. The reference maps preserve the source silhouettes and the generated packs use the existing Canvas 2D frame, transparency and loading budgets.

Build the assets from the application directory.

```sh
python3 -m pip install -r tools/requirements-character-art.txt
python3 tools/build_character_pack_v14.py --characters taher-db sorkhi
python3 tools/build_runtime_character_packs.py --characters taher-db sorkhi --report /tmp/cast-runtime-packs.json
npm run build:static
npm run validate:characters:v14
node tools/check_added_cast_v14.mjs taher-db sorkhi
```

The browser check selected both players from their portraits, confirmed that the choice survived reload and loaded the V14 clips in Dino Run, After Hours, Café Rush and Open World. Jump and slide passed with touch at 390 × 844 and with a keyboard at 1440 × 900. The roster check loaded all 14 portraits at desktop, 320 × 568, 390 × 844 and 844 × 390 sizes. Chromium ran headless with software rendering and emulated touch. [Candidate acceptance run](https://github.com/Parsa-Emami/Demian/actions/runs/44272444382)

## Taher DB and Sorkhi visual update

Taher DB and Sorkhi now use eight distinct facing poses, dedicated gait, jump and low slide artwork, and a portrait rendered through the shared V14 picker. Arsal supplies the motion reference. The sprite build normalizes body height around the shared foot pivot and packs palette-indexed sheets for the device tiers. The original identity sheets remain available through the reference manifests.

The asset and menu workflows informed the frame, pivot, and portrait checks. V14 validation passed all six atlas tiers. Chromium checked the picker, persistence after refresh, all four movement games, and keyboard and emulated touch movement at 1440 × 900 and 390 × 844.
