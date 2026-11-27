# Phase 12 missions

Each Tehran calendar day with a positive server-verified replay earns 5 XP. Playing on three days earns 15 XP, playing two distinct games earns 10 XP, and reaching one adaptive target earns 15 XP. The mission ledger is capped at 75 XP per week, bringing the combined weekly cap to 300 XP. The server credits a replay to its start day based on the verified phone timestamp and the accepted weekly game and rules version.

An adaptive target uses same-version history sealed by the start of the week. At least three qualifying weeks are required and final adaptive XP also requires a personal breakthrough in the current settlement. A single grouped query buckets replay evidence by Tehran date for each participant batch. The mission ledger, base XP and personal progress commit with the same verified weekly results.

The private `GET /api/v1/arcade/player/missions` view shows current progress with deadlines derived from server time and the last finalized result. The data export includes the ledger and account erasure removes it. The browser shows interim XP as provisional until settlement.
