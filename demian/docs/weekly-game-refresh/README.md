# Weekly game refresh

The calendar starts Saturday, 21 November 2026 at 00:00 Asia/Tehran. Every play session pins its content on start. The server derives competitive content from the immutable start timestamp; a replay cannot choose its own week or switch rules during rollover. Device play uses the same calendar. Open World keeps free exploration and adds a separate timed weekly route.

| Game | Weekly variation | Device record |
| --- | --- | --- |
| Dino Run | Obstacle pools, attack probabilities and a rotating two-character cast. Each run still draws its own random seed. | Score |
| After Hours | Two card positions selected from walkable café locations. The camera reserves space for the HUD and its expanded controls. | Fastest successful escape |
| Café Rush | Recipe and table sequence. The ticket and prep stations use 3.25 world units of line-of-sight interaction reach. | Deliveries, then service score |
| Café Critters | 1,000 unique three-guest puzzles with matching written and illustrated clues. | Fastest completed puzzle pack |
| Coffee Crash | Three stages each week. The first stage is the common online challenge so every competitor faces the same board. The other stages have device records. | Score and stage |
| Open World | Four ordered stops chosen from the existing five save points, using the same movement and collision rules. | Fastest completed route |

The 106-week test compares actual content signatures, not week IDs. Coffee Crash has 318 distinct starting boards in that span; a legal sequence solves each within its move limit. The Café Critters bank intentionally reuses the eight guest identities and their art while changing table settings, clue text and guest order. The Dino Run cast and hazards reuse the shipped art with varied profiles and encounter sequences.

Online result rows expose the authoritative tick count and completed objectives. Existing activation gates for global rankings and rewards still apply. Online stage or rules changes begin at the Tehran boundary and do not reinterpret prior replays. A deployment after the planned boundary can use `DEMIAN_WEEKLY_CONTENT_AT` to set a later Tehran Saturday. Ship matching frontend and API before that boundary. When the API or a game's online ranking is unavailable, select the game's device leaderboard.

Local JavaScript tests cover visible content differences, collision-reachable cards, valid match-three paths, game-specific records and camera projection. PHP integration exercises deterministic weekly replay parity and actual issued weeks. Browser scenarios exercise the three-stage dialog, thumbnail grid and the six game entry flows on desktop and mobile viewport profiles.

Applied project guidance covers procedural generation, camera systems, game UI, three.js scene setup and browser playtesting. The original FBX collision geometry and character art are retained.
