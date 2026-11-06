# Dino Run challenge verification

Rules: `cafe-runner-v2`.

The opening speed is 450 logical pixels per second, up from 335. The first wave starts after 0.22 seconds. Its leading encounter is at most 1.05 seconds ahead, including wide tracks; the remaining visible course is filled with seeded, separated encounters. Speed increases to 640 and encounter intervals narrow over time.

Uzudi and AmirReza each have random ground charges and airborne pounces. Contact immediately ends the run and names the attacker on the results screen. Ground attacks can be jumped and airborne attacks can be ducked. Their existing character sheets, west-facing animations and canonical proportions are reused. Four animation instances share at most two attacker images and are released with the game.

Twelve props have distinct drawings and seeded size variation: coffee crates, chairs, suitcases, traffic cones, plants, books, barrels, fans, pendant lamps, hanging signs, serving trays and pipes. Adjacent prop appearances cannot repeat. All threats use the same travel speed to preserve encounter separation. The difficulty indicator and numeric difficulty instructions are removed.

The JavaScript and PHP simulators consume the same rules and RNG draws. Versioned local bests and leaderboard records keep the harder course separate from version 1. Existing backend checks reject outdated rules; no schema change is needed.

## Observed validation

- 387 JavaScript tests passed, including deterministic generation, both lethal attackers, both escape moves, swept collision, reset, initial pressure and three-minute mixed courses at widths 420, 960 and 2560.
- 104 actual PHP/JavaScript replay comparisons passed: eight committed fixtures plus 96 seeded courses at three widths. Both changed PHP files passed syntax checks. Full database API verification is delegated to the existing GitHub Actions matrix.
- Release validation passed for 390 JavaScript files. Skill integrity, master motion, cafe presentation, UI layers and the production atomic bundle checks passed. The exported `playable/build` was also checked for exactly one JavaScript bundle.
- Headless Chromium 153 with software rendering passed at 1440×900, 390×844 and 844×390. Keyboard and emulated touch started real seeded rounds; attacks ended them after approximately 1.08–1.25 seconds. Restart, sprite loading, hidden difficulty, overflow and reduced motion checks passed. No page errors were observed. Physical devices and hardware performance were not measured.

`browser.json` contains the observed browser results. `opening-*` images show real seeded rounds. `attackers-*` images show a controlled scene with both opponents and representative props, with physics frozen for visual inspection. The browser checker also creates ready and results captures when rerun.

## Applied project guidance

- `.agents/skills/router/SKILL.md`
- `.agents/skills/threejs-scene-setup/SKILL.md`, adapted to the existing Canvas 2D presentation without changing engines
- `.agents/skills/procedural-gen/SKILL.md`
- `.agents/skills/game-ai/SKILL.md`
- `.agents/skills/game-ui-ux/SKILL.md`

Browser reproduction: run `node tools/check_dino_challenge.mjs` after building and exporting to `../playable`. The checker accepts the existing `DEMIAN_PLAYWRIGHT_MODULE` and `DEMIAN_BROWSER_EXECUTABLE` overrides.
