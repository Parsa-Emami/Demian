# P0 — Global UI layer and overlay hardening

The release blocker in run 45372631864 was an interactive body-level PWA notice intercepting back navigation after the offline panel moved into its scroll owner.

## Layer contract
- Passive shell/character/network notices: never own pointer events, including descendants; retain semantic status/alert announcements.
- Actionable PWA updates: ordinary in-flow content inside the game library update host. The existing play control indicates a pending update without growing the welcome layout.
- Sticky navigation: use the central local sticky token. Modal and sidebar layers retain their existing semantic ordering and focus behavior.
- Explicit update only: preserve session and pending-score checks; refuse duplicate or hidden/covered activation and refuse activation while an offline pack operation is busy.
- Legacy checked-in static bundle: narrowly relocate body-mounted PWA notices into the same host.

## Evidence and limits
The early browser gate simulates a waiting worker on each profile while keeping the real active worker. It checks passive pointer behavior, modal navigation, all seven game launch targets, download and back controls, and the exact explicit activation message. Actual worker download/integrity, offline play, performance, game acceptance and publication remain independent mandatory gates. No physical device or final deployment is claimed by these changes.
