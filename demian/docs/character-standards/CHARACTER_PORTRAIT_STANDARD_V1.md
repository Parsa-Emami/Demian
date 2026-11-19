# Character Portrait Standard V1

Scope: built-in character selection cards only. Gameplay sprites, physics, avatars, and animations are unchanged.

Use the original front-facing V14 character poster, with a square 224×224 transparent source. The portrait is cropped from the source, never stretched or recoloured. Pixel-art nearest-neighbour rendering is retained. The shared target is eye centre at 50% horizontally and 56% vertically, with eye-to-chin distance up to 21% of the crop. Hair and signature facial features take priority over exact magnification; use a 4% safe inset for the head. Chest/companions outside the portrait may be cropped without altering the original asset.

The calibration in CharacterPortraitStandard.js records eye centre (or glasses centre), chin, and head limits for every shipped character. Review against Darya and Arsal. A new or revised poster must use a frontal/near-frontal view, comparable line weight, palette, sharpness and facial proportions, and an updated landmark entry. Do not substitute another character's face or artificially sharpen low-quality source pixels. The geometry tests enforce roster coverage, source dimensions, crop safety and eye alignment; the art direction and source sharpness require visual review.

Unknown or incompatible posters use the uncropped original. If a poster fails to load, the existing atlas fallback remains available; its pose may differ and is not calibrated. For acceptance, inspect the character selection grid at mobile and desktop sizes, including all hairstyles and glasses. Run `node --test tests/js/CharacterPortraitStandard.test.js tests/js/CharacterPreviewRenderer.test.js tests/js/Phase6Step31CharacterMenu.test.js` from demian.
