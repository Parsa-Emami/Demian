# Phase 10 personal progress

Weekly settlement records the best verified replay score per player, game and rules version. The player must have verified their phone by the start of the run. After three settled weeks, the goal is the highest settled score plus the greater of 25 points and 5 percent rounded up. A new high score that reaches the goal earns an honorary badge. Each rules version establishes its own baseline. Late settlements preserve the score and prior record with a late status.

The weekly transaction locks the progress mutex before the period row so concurrent settlements use a consistent history. Rows store the policy version and weekly source digest. The private leaderboard panel shows the goal and the last 12 points for the latest settled rules version. `GET /api/v1/arcade/player/progress` uses the signed-in player. The data export includes previous versions and account erasure removes personal progress.

The game UI and persistence guidance was applied through `game-ui-ux` and `save-systems`. The six-week simulation covers calibration, a lower week, a reached goal, a tie and a repeated settlement.
