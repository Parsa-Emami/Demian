#!/usr/bin/env bash
# Mobile-11: run over a PINNED-host-key SSH session on an authorized host.
# Usage: bash -s -- SHA /srv/demian-api https://api.example.com staging|production BACKUP_RECEIPT
set -Eeuo pipefail
umask 027

sha="$1"
root="$2"
url="$3"
target="$4"
receipt="$5"

[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid immutable SHA" >&2; exit 2; }
[[ "$root" =~ ^/srv/[A-Za-z0-9_./-]+$ && "$root" != *..* && "$root" != */ ]] ||
    { echo "Deploy root must be a safe absolute path below /srv" >&2; exit 2; }
[[ "$url" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] ||
    { echo "The public API origin must be HTTPS (no path or credentials)" >&2; exit 2; }
[[ "$target" == staging || "$target" == production ]] || exit 2
[[ "$receipt" =~ ^[A-Za-z0-9_.:-]+$ ]] || exit 2
if [[ "$target" == production && "$receipt" == "-" ]]; then
    echo "Production needs an off-host backup/restore approval receipt." >&2
    exit 2
fi

php -r 'exit(PHP_VERSION_ID >= 80300 ? 0 : 1);' ||
    { echo "PHP >= 8.3 required" >&2; exit 2; }
command -v flock >/dev/null
command -v curl >/dev/null
command -v tar >/dev/null

mkdir -p "$root/releases" "$root/.incoming" "$root/shared"
exec 9>"$root/.mobile11-deploy.lock"
flock -n 9 || { echo "Deployment already in progress" >&2; exit 1; }

env_file="$root/shared/.env"
[[ -f "$env_file" && ! -L "$env_file" ]] ||
    { echo "Provision shared/.env manually before deployment" >&2; exit 1; }
grep -Eq '^APP_DEBUG=(false|0)$' "$env_file" ||
    { echo "APP_DEBUG must be false" >&2; exit 1; }
grep -Eq "^APP_ENV=$target$" "$env_file" ||
    { echo "APP_ENV must match the deployment environment" >&2; exit 1; }

archive="$root/.incoming/$sha.tar.gz"
[[ -s "$archive" ]] || { echo "Release artifact not staged" >&2; exit 1; }
# Refuse absolute paths, parent traversal and unexpected link escapes.
if tar -tzf "$archive" | grep -Eq '(^/|(^|/)[.][.](/|$))'; then
    echo "Unsafe archive path" >&2; exit 1
fi

release="$root/releases/$sha"
tmp="$root/releases/.$sha.tmp.$$"
trap 'rm -rf -- "$tmp"' EXIT
if [[ ! -d "$release" ]]; then
    mkdir -p "$tmp"
    tar -xzf "$archive" --no-same-owner -C "$tmp"
    [[ -f "$tmp/artisan" && -f "$tmp/vendor/autoload.php" &&
       -f "$tmp/public/index.php" ]] ||
        { echo "Incomplete Laravel artifact" >&2; exit 1; }
    rm -rf "$tmp/storage"
    ln -s "$root/shared/storage" "$tmp/storage"
    ln -s "$env_file" "$tmp/.env"
    mkdir -p "$tmp/bootstrap/cache"
    printf '%s\n' "$sha" > "$tmp/.mobile11-release"
    (
        cd "$tmp"
        php artisan config:cache
        php artisan route:cache
        php artisan view:cache
    )
    mv -T "$tmp" "$release"
fi

[[ -f "$release/.mobile11-release" &&
   "$(cat "$release/.mobile11-release")" == "$sha" ]] ||
    { echo "Release verification failed" >&2; exit 1; }

# Migrations run BEFORE switching code. Schema changes MUST remain backward
# compatible with the previous release: application rollback cannot undo DDL.
(
    cd "$release"
    php artisan migrate --force --no-interaction
    php artisan arcade:integrity --json
)

previous=""
if [[ -L "$root/current" ]]; then
    previous="$(readlink -f "$root/current")"
    [[ "$previous" == "$root/releases/"* && -d "$previous" ]] ||
        { echo "Current symlink points outside releases" >&2; exit 1; }
elif [[ -e "$root/current" ]]; then
    echo "Current path must be a symlink, refusing to overwrite" >&2
    exit 1
fi

activate() {
    local selected="$1"
    ln -s "$selected" "$root/.next-$sha"
    mv -Tf "$root/.next-$sha" "$root/current"
}

rollback() {
    if [[ -n "$previous" ]]; then activate "$previous"; else rm -f "$root/current"; fi
}

activate "$release"
if ! (
    set -Eeuo pipefail
    response="$(curl -fsS --retry 3 --retry-delay 1 --max-time 15 "$url/api/v1/arcade/health")"
    printf '%s' "$response" | php -r '
        $data = json_decode(stream_get_contents(STDIN), true);
        exit(is_array($data) && ($data["status"] ?? "") === "ok" &&
            ($data["release"] ?? "") === $argv[1] ? 0 : 1);
    ' "$sha"
    for path in '/rules' '/games' '/leaderboards/dino-run?period=weekly'; do
        curl -fsS --retry 2 --max-time 15 -H 'Accept: application/json' \
            "$url/api/v1/arcade$path" >/dev/null
    done
); then
    echo "Readiness/smoke failed; restoring previous code symlink." >&2
    rollback
    exit 1
fi

(cd "$release" && php artisan reload)
rm -f "$archive"
echo "Deployed $sha to $target; health confirmed at $url"
