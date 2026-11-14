#!/usr/bin/env bash
# Demian's cPanel release cutover: never run as root and never copy .env into webroot.
# Usage: deploy.sh SHA ROOT HTTPS_ORIGIN staging|production PHP_BIN BACKUP_RECEIPT
set -Eeuo pipefail
umask 027
[[ "$#" -eq 6 ]] || { echo "Six positional arguments required" >&2; exit 2; }
sha="$1"
root="$2"
origin="$3"
target="$4"
php_bin="$5"
receipt="$6"

[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid release SHA" >&2; exit 2; }
[[ -n "$HOME" && "$root" == "$HOME/"* && "$root" != *..* && "$root" != */ ]] ||
    { echo "Deploy root must be below this cPanel user's HOME" >&2; exit 2; }
url_re='^https://[A-Za-z0-9.-]+(:[0-9]+)?$'
[[ "$origin" =~ $url_re ]] || { echo "Only a bare HTTPS API origin is allowed" >&2; exit 2; }
[[ "$target" == staging || "$target" == production ]] || exit 2
[[ "$php_bin" =~ ^[A-Za-z0-9_./-]+$ ]] || exit 2
[[ "$receipt" =~ ^[A-Za-z0-9_.:-]+$ ]] || exit 2
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

# A cPanel domain/subdomain MUST be configured by the owner with its
# document root at ROOT/current/public, and must allow this symlink target.
# Never point a web root at ROOT, releases, or shared/.env.
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

archive="$root/incoming/$sha.tar.gz"
[[ -s "$archive" ]] || { echo "Release artifact missing" >&2; exit 1; }
if tar -tzf "$archive" | grep -Eq '(^/|(^|/)[.][.](/|$))'; then
    echo "Unsafe artifact paths" >&2; exit 1
fi

release="$root/releases/$sha"
tmp="$root/releases/.$sha.tmp.$$"
trap 'rm -rf -- "$tmp"' EXIT
if [[ ! -d "$release" ]]; then
    mkdir -p "$tmp"
    tar -xzf "$archive" --no-same-owner -C "$tmp"
    [[ -f "$tmp/artisan" && -f "$tmp/vendor/autoload.php" &&
       -f "$tmp/public/index.php" && -f "$tmp/public/.htaccess" ]] ||
        { echo "Artifact missing Laravel public entrypoint or Composer dependencies" >&2; exit 1; }
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
            foreach ($routes as $route) {
                $uri = $route["uri"] ?? "";
                if ($uri === "/" || $uri === "characters" ||
                    str_starts_with($uri, "characters/")) exit(1);
            }
        '
    )
    mv -T "$tmp" "$release"
fi

[[ -f "$release/.mobile11-release" &&
   "$(cat "$release/.mobile11-release")" == "$sha" ]] || exit 1
(
    cd "$release"
    "$php_bin" artisan migrate --force --no-interaction
    "$php_bin" artisan arcade:integrity --json
)

previous=""
if [[ -L "$root/current" ]]; then
    previous="$(readlink -f "$root/current")"
    [[ "$previous" == "$root/releases/"* && -d "$previous" ]] ||
        { echo "Existing current symlink points outside release directory" >&2; exit 1; }
elif [[ -e "$root/current" ]]; then
    echo "current must be a symlink; configure the cPanel document root first" >&2
    exit 1
fi
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
    response="$(curl -fsS --retry 2 --retry-delay 1 --max-time 20 "$origin/api/v1/arcade/health")"
    printf '%s' "$response" | "$php_bin" -r '
        $data = json_decode(stream_get_contents(STDIN), true);
        exit(is_array($data) && ($data["status"] ?? "") === "ok" &&
            ($data["release"] ?? "") === $argv[1] ? 0 : 1);
    ' "$sha"
    curl -fsS --retry 2 --max-time 15 \
        "$origin/api/v1/arcade/leaderboards/dino-run?period=weekly" >/dev/null
    # This must not expose Laravel's non-API character management routes.
    status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$origin/characters")"
    [[ "$status" == 404 ]]
); then
    rollback
    echo "Smoke failed. Previous code restored; migrations were NOT reversed." >&2
    exit 1
fi

rm -f "$archive"
echo "cPanel release $sha healthy on $origin"
