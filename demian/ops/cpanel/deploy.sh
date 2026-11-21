#!/usr/bin/env bash
# Demian's cPanel release cutover: never run as root and never copy .env into webroot.
# Usage: deploy.sh SHA ROOT HTTPS_ORIGIN staging|production PHP_BIN BACKUP_RECEIPT [ARTIFACT_SHA256 [OPTIONAL_FIXED_WEBROOT]]
set -Eeuo pipefail
umask 027
[[ "$#" -ge 6 && "$#" -le 8 ]] || { echo "Expected 6..8 arguments" >&2; exit 2; }
sha="$1"
root="$2"
origin="$3"
target="$4"
php_bin="$5"
receipt="$6"
expected_digest="${7:-}"
webroot="${8:-}"

[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid release SHA" >&2; exit 2; }
[[ -n "$HOME" && "$root" == "$HOME/"* && "$root" != *..* && "$root" != */ ]] ||
    { echo "Deploy root must be below this cPanel user's HOME" >&2; exit 2; }
url_re='^https://[A-Za-z0-9.-]+(:[0-9]+)?$'
[[ "$origin" =~ $url_re ]] || { echo "Only a bare HTTPS API origin is allowed" >&2; exit 2; }
[[ "$target" == staging || "$target" == production ]] || exit 2
[[ "$php_bin" =~ ^[A-Za-z0-9_./-]+$ ]] || exit 2
[[ "$receipt" =~ ^[A-Za-z0-9_.:-]+$ ]] || exit 2
if [[ -n "$webroot" ]]; then
    [[ "$webroot" =~ ^/home/[A-Za-z0-9_./-]+$ && "$webroot" != *..* ]] || {
        echo "Invalid dedicated API webroot" >&2; exit 2;
    }
fi
if [[ -n "$expected_digest" && ! "$expected_digest" =~ ^[a-f0-9]{64}$ ]]; then
    echo "Invalid artifact digest" >&2; exit 2
fi
if [[ "$target" == production && -z "$expected_digest" ]]; then
    echo "Production requires a content-addressed release artifact" >&2; exit 2
fi
if [[ "$target" == production && "$receipt" == "-" ]]; then
    echo "Production requires an independently verified offsite backup receipt" >&2
    exit 2
fi
command -v "$php_bin" >/dev/null || { echo "PHP CLI not available" >&2; exit 2; }
"$php_bin" -r 'exit(PHP_VERSION_ID >= 80300 ? 0 : 1);' ||
    { echo "PHP CLI >= 8.3 required" >&2; exit 2; }
command -v flock >/dev/null
command -v tar >/dev/null
command -v curl >/dev/null

# The owner must configure either ROOT/current/public as a permitted
# DocumentRoot, or a separately confirmed fixed API webroot with the minimal
# bridge installed. Never point DocumentRoot at the Laravel project root.
mkdir -p "$root/releases" "$root/incoming" "$root/shared"
mkdir -p "$root/shared/storage/framework/cache/data" \
    "$root/shared/storage/framework/sessions" \
    "$root/shared/storage/framework/views" \
    "$root/shared/storage/logs"
exec 9>"$root/.deployment.lock"
flock -n 9 || { echo "Another cPanel release is active" >&2; exit 1; }

env_file="$root/shared/.env"
[[ -f "$env_file" && ! -L "$env_file" ]] || { echo "Create shared/.env manually" >&2; exit 1; }
grep -Eq '^APP_DEBUG=(false|0)$' "$env_file" || exit 1
grep -Fx "APP_ENV=$target" "$env_file" >/dev/null || exit 1
grep -Fx "APP_URL=$origin" "$env_file" >/dev/null || exit 1
grep -Eq '^APP_KEY=(base64:)?[A-Za-z0-9+/=]{32,}$' "$env_file" || exit 1
grep -Fx 'DEMIAN_ARCADE_API_ONLY=true' "$env_file" >/dev/null || exit 1
grep -Fx 'DB_CONNECTION=mysql' "$env_file" >/dev/null || exit 1

previous=""
if [[ -L "$root/current" ]]; then
    previous="$(readlink -f "$root/current")"
    [[ "$previous" == "$root/releases/"* && -d "$previous" ]] ||
        { echo "Existing current symlink points outside release directory" >&2; exit 1; }
elif [[ -e "$root/current" ]]; then
    echo "current must be a symlink; configure the cPanel document root first" >&2
    exit 1
fi

archive="$root/incoming/$sha.tar.gz"
[[ -s "$archive" ]] || { echo "Release artifact missing" >&2; exit 1; }
# SHA of the archive is independent of the source Git commit. Check the bytes
# received over SSH before listing, extracting or executing any content.
if [[ -n "$expected_digest" ]]; then
    actual_digest="$("$php_bin" -r 'echo hash_file("sha256", $argv[1]);' "$archive")"
    [[ "$actual_digest" == "$expected_digest" ]] ||
        { echo "Release archive SHA-256 mismatched; nothing extracted" >&2; exit 1; }
fi
entries="$root/incoming/$sha.entries"
trap 'rm -f -- "$entries"' EXIT
tar -tzf "$archive" > "$entries"
if grep -Eq '(^/|(^|/)[.][.](/|$)|(^|/)([.]env|[.]git|[.]ssh)(/|$))' "$entries"; then
    echo "Unsafe or private paths in artifact" >&2; exit 1
fi
# The release format must contain only ordinary files and directories.
# The trusted storage/.env symlinks are created by this script later, not
# extracted from the artifact where a malicious link could escape the root.
types="$root/incoming/$sha.types"
trap 'rm -f -- "$entries" "$types"' EXIT
tar -tvzf "$archive" > "$types"
if grep -Eq '^[^d-]' "$types"; then
    echo "Symbolic links are forbidden inside cPanel release artifacts, as are hard links and special files" >&2; exit 1
fi
rm -f "$entries" "$types"

release="$root/releases/$sha"
[[ ! -L "$release" ]] || { echo "Release directory must not be a symbolic link" >&2; exit 1; }
tmp="$root/releases/.$sha.tmp.$$"
trap 'rm -rf -- "$tmp"' EXIT
if [[ ! -d "$release" ]]; then
    mkdir -p "$tmp"
    tar -xzf "$archive" --no-same-owner -C "$tmp"
    [[ -f "$tmp/artisan" && -f "$tmp/vendor/autoload.php" &&
       -f "$tmp/public/index.php" && -f "$tmp/public/.htaccess" ]] ||
        { echo "Artifact missing Laravel public entrypoint or Composer dependencies" >&2; exit 1; }
    [[ -f "$tmp/ops/cpanel/cron.sh" && -f "$tmp/ops/cpanel/rollback.sh" &&
       -f "$tmp/ops/cpanel/install_webroot_bridge.php" ]] || {
        echo "cPanel cron or rollback contract is missing" >&2; exit 1
    }
    [[ -f "$tmp/ops/cpanel/host_preflight.php" && ! -L "$tmp/ops/cpanel/host_preflight.php" ]] || {
        echo "cPanel production preflight contract is missing" >&2; exit 1;
    }
    "$php_bin" "$tmp/ops/cpanel/host_preflight.php" "$env_file" "$target" "$origin"
    rm -rf "$tmp/storage"
    ln -s "$root/shared/storage" "$tmp/storage"
    ln -s "$env_file" "$tmp/.env"
    mkdir -p "$tmp/bootstrap/cache"
    printf '%s\n' "$sha" > "$tmp/.mobile11-release"
    (
        cd "$tmp"
        "$php_bin" artisan optimize
        # Fail closed: API-only mode must suppress /characters and /
        "$php_bin" artisan route:list --json | "$php_bin" -r '
            $routes = json_decode(stream_get_contents(STDIN), true);
            if (!is_array($routes)) exit(1);
            $hasApi = false;
            foreach ($routes as $route) {
                $uri = $route["uri"] ?? "";
                if ($uri === "/" || $uri === "characters" ||
                    str_starts_with($uri, "characters/")) exit(1);
                if ($uri === "api/v1/arcade/health") $hasApi = true;
            }
            exit($hasApi ? 0 : 1);
        '
    )
    mv -T "$tmp" "$release"
fi

[[ -f "$release/.mobile11-release" &&
   "$(cat "$release/.mobile11-release")" == "$sha" ]] || exit 1
# Check every deploy, including redeploys of an existing immutable SHA.
# The contract prints no .env values and does not touch production data.
"$php_bin" "$release/ops/cpanel/host_preflight.php" "$env_file" "$target" "$origin"
if [[ "$target" == production ]]; then
    # A hosted cron schedule is a hard production gate. Scheduling itself
    # remains an owner-controlled cPanel operation, never installed by CI.
    command -v crontab >/dev/null || { echo "cPanel Cron Jobs unavailable" >&2; exit 1; }
    if ! crontab -l 2>/dev/null | grep -F "$root/current" |
        grep -Eq 'artisan schedule:run|ops/cpanel/cron.sh' ; then
        echo "Production Laravel scheduler cron for this release root is missing" >&2; exit 1
    fi
fi
if [[ -n "$webroot" ]]; then
    "$php_bin" "$release/ops/cpanel/install_webroot_bridge.php"         "$root" "$webroot" DEMIAN_API_SUBDOMAIN_ONLY
fi
(
    cd "$release"
    "$php_bin" artisan migrate --force --no-interaction
    # Database/schema/queue/session check on the actual cPanel PHP CLI;
    # never swap current if the new release is missing a migration.
    "$php_bin" artisan arcade:hosting:doctor --target="$target" --json
    "$php_bin" artisan arcade:integrity --json
    "$php_bin" artisan arcade:audit-coupons --json
    # Code rollout is allowed with financial features safely disabled.
    # Any attempt to enable physical redemption must pass all live gates.
    if grep -Fx 'DEMIAN_COUPONS_CAFE_ENABLED=true' "$env_file" >/dev/null; then
        "$php_bin" artisan arcade:cafe:preflight --target="$target" --require-live --json
    else
        "$php_bin" artisan arcade:cafe:preflight --target="$target" --json
    fi
)

switch_to() {
    ln -s "$1" "$root/.next-$sha"
    mv -Tf "$root/.next-$sha" "$root/current"
}
rollback() {
    if [[ -n "$previous" ]]; then switch_to "$previous"; else rm -f "$root/current"; fi
}
switch_to "$release"

if ! (
    set -Eeuo pipefail
    response="$(curl -fsS --retry 2 --retry-delay 1 --max-time 20 "$origin/api/v1/arcade/health")" || exit 1
    printf '%s' "$response" | "$php_bin" -r '
        $data = json_decode(stream_get_contents(STDIN), true);
        exit(is_array($data) && ($data["status"] ?? "") === "ok" &&
            ($data["release"] ?? "") === $argv[1] ? 0 : 1);
    ' "$sha" || exit 1
    curl -fsS --retry 2 --max-time 15 \
        "$origin/api/v1/arcade/leaderboards/dino-run?period=weekly" >/dev/null || exit 1
    # This must not expose Laravel's non-API character management routes.
    status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$origin/characters")" || exit 1
    [[ "$status" == 404 ]] || exit 1
    # A cashier URL must be reachable only when the cafe is explicitly enabled.
    # This is a nonmutating check; no real discount is issued/redeemed.
    cashier_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$origin/cashier/login")" || exit 1
    if grep -Fx 'DEMIAN_COUPONS_CAFE_ENABLED=true' "$env_file" >/dev/null; then
        [[ "$cashier_status" == 200 ]] || exit 1
    else
        [[ "$cashier_status" == 503 ]] || exit 1
    fi
); then
    rollback
    echo "Smoke failed. Previous code restored; migrations were NOT reversed." >&2
    exit 1
fi

rm -f "$archive"
echo "cPanel release $sha healthy on $origin"
