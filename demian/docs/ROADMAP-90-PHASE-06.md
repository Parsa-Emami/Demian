# Roadmap 90+ — Phase 06 Advanced Anti-Cheat

Stacked on PR #91 after normalizing Cache-Control assertion. PR #87 private storage denial acceptance corrected separately. Do not merge before earlier phases and CI acceptance.

- Central signed server wall-clock guard for all 60 Hz ranked games, fixed two-second transport/DB precision tolerance; no client wall time. Reject future start well beyond tolerance. Run ownership, version, random/server seed, deterministic physics, expiry and transactional replay commitment preserved. Dino endpoint cannot complete another game's run. Reject mixed turn/frame proof shapes and non-list/extraneous runner transitions.
- Observe parallel active runs, periodic runner jump edges (minimum sustained evidence), exact replay reuse, velocity/density and score outlier. Baseline is same-week same-version personal best by distinct other players (at least 20). Fixed weekly courses can legitimately generate identical inputs; no human/bot claim from any single trace.
- Aggregate open/investigating evidence in seven days, maximum per independent family, cap 100, single family max 69; shared network/installation and identity conflicts excluded from gameplay risk. Only private staff dashboard displays queue. No automated score, award, token, coupon or ban mutation. Explicit superadmin reviewed temporary new-run hold remains; shared identity/network and cadence/parallel signals cannot directly justify holds.
- Existing retention and privacy erasure retained; no new tables or trace retention. Risk is heuristic review priority, not cheating probability. All valid proof paths continue accepting idempotent retries.
- Existing anti-cheat flag remains OFF until physical pilot, reviewed thresholds, persistent cache, schedule, staffing and owner acceptance. CI uses artificial evidence and existing parity tests, not real-world bot detection validation.
- Tests: signed time boundary, invalid cross-game completion, periodic/variable/held inputs, duplicate risk signals, shared network exclusion, human review restriction, full existing regression.
Next: Phase 07 — unified character visual standard V2.
