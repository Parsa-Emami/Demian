# Production art acceptance

Review the active Darya and Arsal references, then check every character against them. Examine head and body proportions, limbs, outline, pixel quality, identity, motion, crawl and dodge, and rendering on desktop and mobile. Record the reviewer, review date, and visual evidence for each character in `production-art-acceptance.json`. The audit scripts produce measurements and contact sheets for this review.

For each character, record true results for the nine checks defined in `verify_character_art_acceptance.py`, the hashes returned by `files_for(slug, version)` for that character's active pack, and evidence files under `demian/docs` with their SHA-256 hashes. Record SHA-256 hashes for all three files in `STANDARDS` and set the status to `approved` after the review.

The manual cPanel production workflow checks the roster, art standards, active pack hashes, and evidence before deployment. Run the same verifier against the exact release before any manual production upload. Staging and GitHub Pages previews can be used to collect review evidence.
