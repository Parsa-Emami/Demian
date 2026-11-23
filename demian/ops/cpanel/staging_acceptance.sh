#!/usr/bin/env bash
# PR08: read-only cPanel staging checks after exact-SHA deployment.
set -Eeuo pipefail
umask 077
[[ "$#" -eq 4 ]] || exit 2
root="$1"; sha="$2"; php_bin="$3"; origin="$4"
[[ "$sha" =~ ^[a-f0-9]{40}$ ]] || exit 2
[[ "$root" == "$HOME/"* && "$root" == *staging* && "$root" != *..* ]] || exit 2
[[ "$php_bin" =~ ^[A-Za-z0-9_./-]+$ ]] || exit 2
[[ "$origin" =~ ^https://[a-zA-Z0-9.-]*staging[a-zA-Z0-9.-]*$ ]] || exit 2
[[ -L "$root/current" ]] || exit 1
real="$(readlink -f "$root/current")"
[[ "$real" == "$root/releases/$sha" && -f "$real/artisan" ]] || exit 1
[[ -f "$root/shared/.env" && ! -L "$root/shared/.env" ]] || exit 1
"$php_bin" -r 'exit(PHP_VERSION_ID >= 80400 ? 0 : 1);' || exit 1
command -v crontab >/dev/null || exit 1
crons="$(crontab -l 2>/dev/null)" || exit 1
grep -F "$root/current" <<< "$crons" |
    grep -Eq 'artisan schedule:run|ops/cpanel/cron.sh' || exit 1
"$php_bin" "$real/ops/cpanel/host_preflight.php" "$root/shared/.env" staging "$origin" >/dev/null
(
    cd "$real"
    "$php_bin" artisan arcade:hosting:doctor --target=staging --json >/dev/null
    "$php_bin" artisan arcade:integrity --json >/dev/null
    "$php_bin" artisan arcade:audit-coupons --json >/dev/null
)
printf '{"schema":1,"kind":"demian-cpanel-staging-host-check","target":"staging","sourceSha":"%s","php84Verified":true,"cronVerified":true,"databaseDoctorPassed":true,"integrityPassed":true,"couponAuditPassed":true,"productionAuthorized":false,"offsiteRestoreVerified":false,"fiftyVuHostCapacityVerified":false}\n' "$sha"
