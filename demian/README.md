# Demian mobile release 14

راهنمای اجرای خروجی کامل، ساخت از سورس، نصب Laravel و کنترل‌ها در [README فارسی](../README.fa.md) است.

The active catalog contains Open World and Dino Run. The installed V14 roster is Darya, Setayesh and Uzudi. The full source scaffold, previous game modules, original configuration and migrations remain available. Historical phase documents describe earlier versions; use the current guide for this release.

- Ready static release: `../playable/` (serve over HTTP).
- Shared character contract: `docs/character-standards/MOBILE_CHARACTER_V14.fa.md`.
- Actual checks and limitations: `docs/release-v14/QA.fa.md`.
- Exact image-generation prompts: `docs/release-v14/art-prompts.json`.
- Runtime: local Canvas2D, no generation service, no GPU shader pipeline.

## FBX café environment

The active café map is built from the supplied FBX, with a shared collision footprint and an on-demand 3D model view. See [the source and rebuild guide](docs/fbx-cafe/README.fa.md). The original upload is preserved in four lossless gzip parts under `sources/`.
