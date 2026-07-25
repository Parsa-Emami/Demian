# Demian V3 — TIAM 2D Arcade

## What changed

- Replaced the perspective/orbit presentation with a stable orthographic 2D arcade camera.
- Added two view modes: `OVERVIEW` for the whole room and `FOLLOW` for a centered close view of TIAM.
- Fixed the left/right flicker by using one coherent directional source frame per action.
- Kept the original TIAM pixels untouched; movement personality is generated procedurally with squash, stretch, bob, lean and easing.
- Added an automatic intro sequence: victory, attack and jump.
- Added dust, landing, slash, sparkle, heart and star effects.
- Rebuilt the room as a pixel-art arcade stage with cabinets, neon wall, score panels, floor tiles and floating pixels.
- Added mobile/touch controls for movement, run, jump, attack and victory.
- Kept keyboard support: WASD/arrows, Shift, Space, E, Q, F, R and M.

## Important asset behavior

`public/assets/characters/tiam/tiam-spritesheet.png` is still the original source image. The updated atlas intentionally selects stable same-facing frames. Do not restore the old alternating walk/run/attack frame pairs unless both frames face the same direction.
