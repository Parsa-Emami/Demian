#!/usr/bin/env bash
# Explicit operator-only encrypted MySQL backup. Does NOT assert offsite transfer.
# Usage: backup_mysql.sh DATABASE MYSQL_DEFAULTS_FILE AGE_RECIPIENT OUTPUT_DIRECTORY
set -Eeuo pipefail
umask 077
[[ "$#" -eq 4 ]] || { echo "Usage: backup_mysql.sh DATABASE CNF RECIPIENT OUTDIR" >&2; exit 2; }
database="$1"
credentials="$2"
recipient="$3"
out="$4"
[[ "$database" =~ ^[A-Za-z0-9_]+$ && "$recipient" =~ ^age1[0-9a-z]+$ ]] || exit 2
[[ -f "$credentials" && ! -L "$credentials" ]] || exit 2
[[ "$(stat -c %a "$credentials")" == 600 ]] || {
    echo "MySQL defaults file must have mode 0600" >&2; exit 2;
}
command -v age >/dev/null
command -v mysqldump >/dev/null
command -v gzip >/dev/null
mkdir -p "$out"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$out/demian-$database-$stamp.sql.gz.age"
partial="$final.partial"
trap 'rm -f "$partial"' EXIT
# --defaults-extra-file MUST be the first mysqldump argument.
mysqldump --defaults-extra-file="$credentials" \
    --single-transaction --quick --set-gtid-purged=OFF \
    --routines --triggers --events --no-tablespaces "$database" |
    gzip -9 | age -r "$recipient" -o "$partial"
[[ -s "$partial" ]] || exit 1
mv "$partial" "$final"
sha256sum "$final" > "$final.sha256"
echo "Encrypted backup: $final"
echo "OFFSITE TRANSFER AND RESTORE DRILL ARE STILL REQUIRED."
