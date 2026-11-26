#!/usr/bin/env bash
# cPanel Cron job: one-shot, no daemon or root.
# Example (set correct account and php path):
# * * * * * /bin/bash /home/USER/demian-api/current/ops/cpanel/cron.sh /home/USER/demian-api/current /usr/local/bin/ea-php84 schedule >/dev/null 2>&1
set -Eeuo pipefail
umask 077
[[ "$#" -eq 3 ]] || { echo "Usage: cron.sh CURRENT PHP_BIN schedule|queue" >&2; exit 2; }
current="$1"; php_bin="$2"; mode="$3"
[[ "$current" == "$HOME/"* && "$current" == */current && "$current" != *..* ]] || exit 2
[[ "$php_bin" =~ ^[A-Za-z0-9_./-]+$ ]] || exit 2
[[ "$mode" == schedule || "$mode" == queue ]] || exit 2
root="${current%/current}"
[[ -L "$current" && -f "$current/artisan" && -f "$root/shared/.env" ]] || exit 2
real="$(readlink -f "$current")"
[[ "$real" == "$root/releases/"* && -d "$real" ]] || exit 2
command -v "$php_bin" >/dev/null
command -v flock >/dev/null
exec 8>"$root/shared/.cron-$mode.lock"
flock -n 8 || exit 0
cd "$current"
if [[ "$mode" == schedule ]]; then
    "$php_bin" artisan schedule:run --no-ansi
else
    # Optional bounded queue drain; no resident PHP worker on shared hosting.
    "$php_bin" artisan queue:work database --stop-when-empty --max-time=45 --sleep=1 --tries=3 --memory=128 --no-ansi
fi
