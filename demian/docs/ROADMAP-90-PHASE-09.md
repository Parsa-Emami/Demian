# Skill leagues

The weekly settlement writes a skill league snapshot atomically alongside the official technical results. A score qualifies for the cohort if the player had verified their phone by the start of that run. Each game needs 20 distinct verified players to award 0–1000 points based on midrank percentile. The strongest qualifying game result is used once per player. Smaller cohorts appear in placement. Promotion takes effect in the finalized result. Demotion requires three qualifying results more than 100 points below the tier threshold and can move a player at most one tier below their lifetime peak.

The starting tier for an active week uses the results finalized by the Tehran Saturday boundary. The personal view also shows the latest finalized result. The leaderboard view offers league and archived-week selection. Top-three ranks in a qualified tier receive recognition in the public standings. The league has zero financial rewards.

`GET /api/v1/arcade/competition/leagues` reads the latest finalized public board or a selected Tehran Saturday. `GET /api/v1/arcade/player/competition/league` uses the active player session. The private data export includes `skill_leagues`. Account erasure removes the player and run links from historical league rows and hides those entries from the public board.

The production cPanel workflow verifies active character versions and signed-off art evidence before deployment. See [Production art acceptance](character-standards/PRODUCTION_ART_GATE.md).
