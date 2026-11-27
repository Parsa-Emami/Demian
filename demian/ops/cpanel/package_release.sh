#!/usr/bin/env bash
# Canonical, CI-only construction of the exact backend-only cPanel artifact.
# Usage (from demian/): bash ops/cpanel/package_release.sh OUTPUT_DIR SOURCE_SHA
# Never deploys, reads hosting secrets, migrates, or enables financial flags.
set -Eeuo pipefail
umask 077
[[ "$#" -eq 2 ]] || { echo "Expected output directory and 40-character Git SHA" >&2; exit 2; }
output="$1"
source_sha="$2"
[[ "$source_sha" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid exact source SHA" >&2; exit 2; }
[[ -d "$output" && ! -L "$output" ]] || { echo "Output must be a real existing directory" >&2; exit 2; }
command -v tar >/dev/null
command -v sha256sum >/dev/null
command -v php >/dev/null

# Explicit allowlist shared with the manual workflow. No .env, private
# storage, database dumps, cached config/routes, node_modules or test tools.
entries=(
    artisan app bootstrap config database routes
    resources/game resources/legal resources/views src
    resources/js/game/games/cafe-drift/CafeDriftModel.js
    resources/js/game/games/cafe-drift/CafeDriftGame.js
    resources/js/game/games/cafe-drift/CafeDriftRenderer.js
    resources/css/cafe-drift.css
    public/index.php public/.htaccess
    ops/cpanel/host_preflight.php ops/cpanel/cron.sh
    ops/cpanel/rollback.sh ops/cpanel/backup_offsite.sh
    ops/cpanel/restore_drill.sh ops/cpanel/staging_acceptance.sh ops/cpanel/install_webroot_bridge.php
    composer.json composer.lock vendor
)
for entry in "${entries[@]}"; do
    [[ -e "$entry" && ! -L "$entry" ]] || {
        echo "Required production file missing or linked: $entry" >&2; exit 1;
    }
done
[[ ! -e .env ]] || { echo "Package workspace contains a .env file" >&2; exit 1; }

archive_tmp="$(mktemp "$output/.demian-cpanel.XXXXXXXX.tar.gz")"
digest_tmp="$(mktemp "$output/.demian-cpanel.XXXXXXXX.sha256")"
manifest_tmp="$(mktemp "$output/.demian-cpanel.XXXXXXXX.json")"
trap 'rm -f -- "$archive_tmp" "$digest_tmp" "$manifest_tmp"' EXIT

# A verified CI artifact is independent of environment-specific bootstrap
# caches. Do not silently include generated service-provider or route caches.
tar --exclude='bootstrap/cache/*.php' -czf "$archive_tmp" "${entries[@]}"
listing="$(mktemp "$output/.demian-cpanel.XXXXXXXX.entries")"
types="$(mktemp "$output/.demian-cpanel.XXXXXXXX.types")"
trap 'rm -f -- "$archive_tmp" "$digest_tmp" "$manifest_tmp" "$listing" "$types"' EXIT
tar -tzf "$archive_tmp" > "$listing"
tar -tvzf "$archive_tmp" > "$types"

if grep -Eq '(^/|(^|/)[.][.](/|$)|(^|/)([.]env|[.]git|[.]ssh|node_modules)(/|$)|^bootstrap/cache/.*[.]php$)' "$listing"; then
    echo "Artifact contains a forbidden or environment-specific path" >&2; exit 1
fi
if grep -Eq '^[^d-]' "$types"; then
    echo "Artifact contains a symlink, hardlink or special filesystem entry" >&2; exit 1
fi
for required in artisan public/index.php public/.htaccess vendor/autoload.php \
    ops/cpanel/host_preflight.php ops/cpanel/cron.sh ops/cpanel/rollback.sh; do
    grep -Fx "$required" "$listing" >/dev/null || {
        echo "Artifact missing required runtime file: $required" >&2; exit 1;
    }
done
digest="$(sha256sum "$archive_tmp" | cut -d' ' -f1)"
[[ "$digest" =~ ^[a-f0-9]{64}$ ]] || exit 1
printf '%s\n' "$digest" > "$digest_tmp"
php -r '
    $data = [
        "schema" => 1, "kind" => "demian-cpanel-api-only",
        "commit" => $argv[2], "archiveSha256" => $argv[3],
        "productionAuthorized" => false, "hostDeployed" => false,
        "financialFlagsActivated" => false
    ];
    file_put_contents($argv[1], json_encode($data, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT) . "\n");
' "$manifest_tmp" "$source_sha" "$digest"

# Commit all outputs last, after verifying the archive. Consumers must
# independently verify the archive and manifest with the .sha256 sidecar.
mv -f -- "$archive_tmp" "$output/demian-cpanel.tar.gz"
mv -f -- "$digest_tmp" "$output/demian-cpanel.sha256"
mv -f -- "$manifest_tmp" "$output/demian-cpanel.manifest.json"
echo "cPanel API-only artifact packaged; source=$source_sha sha256=$digest (NO DEPLOY)"
