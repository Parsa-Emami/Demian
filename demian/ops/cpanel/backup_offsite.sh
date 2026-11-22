#!/usr/bin/env bash
# Manual, consistent encrypted MySQL/MariaDB backup. No plaintext SQL files.
# Usage: backup_offsite.sh DB MYSQL_DEFAULTS_CNF AGE_RECIPIENT PRIVATE_OUTPUT_DIR
set -Eeuo pipefail
umask 077
[[ "$#" -eq 4 ]] || { echo "Expected DB, private CNF, age recipient and output path" >&2; exit 2; }
database="$1"; credentials="$2"; recipient="$3"; out="$4"
[[ "$database" =~ ^[A-Za-z0-9_]+$ ]] || exit 2
[[ "$recipient" =~ ^age1[023456789acdefghjklmnpqrstuvwxyz]{50,80}$ ]] || exit 2
[[ -f "$credentials" && ! -L "$credentials" && -r "$credentials" ]] || exit 2
mode="$(stat -c '%a' "$credentials")"
[[ "$mode" == 600 || "$mode" == 400 ]] || exit 2
[[ "$out" == /* && "$out" != *..* && "$out" != */public_html* && "$out" != */public/* ]] || exit 2
command -v age >/dev/null || { echo "No age binary; run a trusted off-host streaming backup instead" >&2; exit 1; }
command -v gzip >/dev/null
command -v sha256sum >/dev/null
dump="$(command -v mariadb-dump || command -v mysqldump || true)"
[[ -n "$dump" ]] || { echo "MySQL/MariaDB dump client unavailable" >&2; exit 1; }
mkdir -p -- "$out"
chmod 700 -- "$out"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$out/demian-$database-$stamp.sql.gz.age"
partial="$final.partial"
trap 'rm -f -- "$partial"' EXIT
options=("--defaults-extra-file=$credentials" --single-transaction --quick \
    --routines --triggers --events --no-tablespaces)
# MariaDB's dump program may not accept MySQL-only GTID options.
if "$dump" --help 2>/dev/null | grep -q -- '--set-gtid-purged'; then
    options+=(--set-gtid-purged=OFF)
fi
"$dump" "${options[@]}" "$database" | gzip -6 | age -r "$recipient" -o "$partial"
[[ -s "$partial" ]] || exit 1
mv -- "$partial" "$final"
digest="$(sha256sum "$final" | cut -d' ' -f1)"
printf '%s\n' "$digest" > "$final.sha256"
chmod 600 "$final" "$final.sha256"
printf 'Encrypted local backup: %s\nSHA256: %s\nOFFSITE TRANSFER & RESTORE DRILL STILL REQUIRED.\n' "$final" "$digest"
