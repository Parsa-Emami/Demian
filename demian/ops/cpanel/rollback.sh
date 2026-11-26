#!/usr/bin/env bash
# Explicit human code-only rollback. NO migration reversal or database restore.
# Usage: rollback.sh ROOT RELEASE_SHA HTTPS_ORIGIN PHP_BIN ROLLBACK_CODE_ONLY_DB_COMPATIBLE
set -Eeuo pipefail
umask 077
[[ "$#" -eq 5 ]] || { echo "Expected root, SHA, origin, PHP and acknowledgement" >&2; exit 2; }
root="$1"; sha="$2"; origin="$3"; php_bin="$4"; ack="$5"
[[ -n "${HOME:-}" && "$root" == "$HOME/"* && "$root" != *..* && "$root" != */ ]] || exit 2
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ "$origin" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || exit 2
[[ "$php_bin" =~ ^[A-Za-z0-9_./-]+$ ]] || exit 2
[[ "$ack" == ROLLBACK_CODE_ONLY_DB_COMPATIBLE ]] || {
    echo "Schema compatibility must be reviewed and explicitly acknowledged" >&2; exit 2;
}
command -v "$php_bin" >/dev/null
command -v flock >/dev/null
command -v curl >/dev/null
exec 9>"$root/.deployment.lock"
flock -n 9 || { echo "Deployment or rollback already running" >&2; exit 1; }
[[ -L "$root/current" ]] || exit 1
previous="$(readlink -f "$root/current")"
target="$root/releases/$sha"
[[ "$previous" == "$root/releases/"* && -d "$previous" ]] || exit 1
[[ "$target" != "$previous" && -d "$target" && ! -L "$target" ]] || exit 1
[[ -f "$target/.mobile11-release" && "$(cat "$target/.mobile11-release")" == "$sha" ]] || exit 1
[[ -f "$target/artisan" && -f "$target/vendor/autoload.php" ]] || exit 1
env_file="$root/shared/.env"
[[ -f "$env_file" && ! -L "$env_file" ]] || exit 1
if grep -Fx 'APP_ENV=production' "$env_file" >/dev/null; then
    environment=production
elif grep -Fx 'APP_ENV=staging' "$env_file" >/dev/null; then
    environment=staging
else
    echo "Unknown environment" >&2; exit 1
fi
"$php_bin" "$target/ops/cpanel/host_preflight.php" "$env_file" "$environment" "$origin"
switch_to() {
    local candidate="$1" next="$root/.rollback-next-$$"
    ln -s "$candidate" "$next"
    mv -Tf "$next" "$root/current"
}
switch_to "$target"
if ! (
    response="$(curl -fsS --max-time 20 --retry 2 --retry-delay 1 \
        -H 'Cache-Control: no-cache' "$origin/api/v1/arcade/health")" || exit 1
    printf '%s' "$response" | "$php_bin" -r '
        $data=json_decode(stream_get_contents(STDIN), true);
        exit(is_array($data) && ($data["status"]??null)==="ok"
             && ($data["release"]??null)===$argv[1] ? 0 : 1);
    ' "$sha"
); then
    switch_to "$previous"
    echo "Rollback target unhealthy; original code restored; DB unchanged" >&2
    exit 1
fi
printf '%s | approved code rollback | from=%s | to=%s | migrations=unchanged\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "$previous")" "$sha" \
    >> "$root/shared/rollback-journal.log"
echo "Code-only rollback activated: $sha; database migrations unchanged."
