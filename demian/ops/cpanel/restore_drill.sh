#!/usr/bin/env bash
# Run OFF production with a MySQL user allowed ONLY on a pre-created disposable DB.
# Usage: restore_drill.sh AGE_ARCHIVE AGE_IDENTITY MYSQL_CNF TEST_DB PROD_DB RECEIPT_DIR EXPECTED_SHA256
set -Eeuo pipefail
umask 077
[[ "$#" -eq 7 ]] || { echo "Seven restore drill arguments required" >&2; exit 2; }
archive="$1"; identity="$2"; credentials="$3"; test_db="$4"
production_db="$5"; out="$6"; expected="$7"
[[ "$test_db" =~ ^[A-Za-z0-9_]+_(restore|drill)$ ]] || exit 2
[[ "$production_db" =~ ^[A-Za-z0-9_]+$ && "$test_db" != "$production_db" ]] || exit 2
[[ "$expected" =~ ^[a-f0-9]{64}$ ]] || exit 2
[[ -f "$archive" && "$archive" == *.age && -s "$archive" && ! -L "$archive" ]] || exit 2
for secret in "$identity" "$credentials"; do
    [[ -f "$secret" && ! -L "$secret" && -r "$secret" ]] || exit 2
    mode="$(stat -c '%a' "$secret")"
    [[ "$mode" == 600 || "$mode" == 400 ]] || exit 2
done
[[ "$out" == /* && "$out" != *..* && "$out" != */public_html* ]] || exit 2
command -v age >/dev/null
command -v gzip >/dev/null
command -v sha256sum >/dev/null
mysql_bin="$(command -v mariadb || command -v mysql || true)"
[[ -n "$mysql_bin" ]] || exit 2
actual="$(sha256sum "$archive" | cut -d' ' -f1)"
[[ "$actual" == "$expected" ]] || {
    echo "Backup digest differs from independent offsite receipt" >&2; exit 1;
}
# The dedicated restore user must have NO permissions on production databases.
# The source backup uses no --databases or USE statement.
age -d -i "$identity" "$archive" | gzip -dc |
    "$mysql_bin" "--defaults-extra-file=$credentials" "--database=$test_db" --binary-mode
tables="$("$mysql_bin" "--defaults-extra-file=$credentials" \
    "--database=$test_db" --batch --skip-column-names \
    -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$test_db' AND table_name IN ('migrations','arcade_players','arcade_runs','arcade_coupons');")"
[[ "$tables" =~ ^[0-9]+$ && "$tables" -eq 4 ]] || {
    echo "Restored critical schema incomplete" >&2; exit 1;
}
mkdir -p -- "$out"
chmod 700 -- "$out"
receipt="$out/demian-restore-$(date -u +%Y%m%dT%H%M%SZ).json"
printf '{"status":"passed","mode":"disposable-schema-only","source_sha256":"%s","critical_tables_present":%s,"production_db_untouched_by_script":true,"completed_utc":"%s"}\n' \
    "$actual" "$tables" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$receipt"
chmod 600 "$receipt"
printf 'Private restore-drill receipt: %s\n' "$receipt"
