# Demian development instructions

For every Demian game task, use the project-local skills from https://github.com/gamedev-skills/awesome-gamedev-agent-skills. Start with `.agents/skills/router/SKILL.md`, then read only the skills and references relevant to the feature. This standing project preference covers graphics, animation, controls, actions, cameras, UI, AI, audio, saving, levels, testing and performance.

The 77 upstream skills are installed unchanged in `.agents/skills/`. Their source commit, hashes and Apache-2.0 attribution are recorded in `third_party/game-dev-skills/skills-lock.json`, `LICENSE` and `NOTICE`. Refresh the pinned copy deliberately after reviewing upstream changes. Preserve attribution and unrelated project skills.

The current playable engine uses Canvas 2D, three.js-backed character simulation and collision, and an optional GLB inspector. Check `demian/package-lock.json` for the installed three.js version. Legacy Phaser filenames do not make this a Phaser runtime. Keep the current engine and dependency versions unless a migration is requested; adapt portable skill concepts to this implementation.

Preserve character identities, canonical body proportions, grounded foot pivots and the FBX-derived cafe collision layout. Keep fixed-step physics separate from visual feedback. Use semantic actions for keyboard, touch and standard gamepads. Respect reduced motion and bounded effects and asset budgets. Actions must resolve to shipped artwork or a documented existing animation fallback. Keep retired combat controls removed.

Reuse the application lifecycle, input contexts, settings store, UI layers and static export workflow. Do not change the database, migrations, `.env` or Docker configuration for frontend work. Do not add comments to authored code. Keep vendored files unchanged.

Run relevant JavaScript regressions plus release, UI-layer, skill-integrity and atomic-bundle checks. Validate changed gameplay in desktop and phone browser layouts; report emulated devices and software rendering accurately. Record applied skills and observed results. Commit source and refreshed `playable/` output and provide the Git commit title. Check the GitHub workflow before reporting successful deployment.
