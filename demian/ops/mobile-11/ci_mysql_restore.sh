#!/usr/bin/env bash
# CI ONLY: test a real MySQL logical dump + restore on disposable schemas.
set -Eeuo pipefail
[[ "$CI" == true && "$APP_ENV" == testing &&
   "$DB_CONNECTION" == mysql && "$DB_DATABASE" == demian_test &&
   "$DB_HOST" == 127.0.0.1 && "$DB_USERNAME" == root ]] || {
    echo "Refusing to run outside the isolated MySQL CI test environment" >&2
    exit 2
}
command -v mysql >/dev/null
command -v mysqldump >/dev/null

export MYSQL_PWD="$DB_PASSWORD"
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
php artisan migrate:fresh --force --no-interaction
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" "$DB_DATABASE" <<'SQL'
SET @fixture_started_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 SECOND);
INSERT INTO arcade_players
    (id, display_name, token_hash, token_expires_at, created_at, updated_at)
VALUES
    ('11111111-1111-4111-8111-111111111111', 'Restore Probe',
     REPEAT('a',64), DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY),
     UTC_TIMESTAMP(), UTC_TIMESTAMP());

INSERT INTO arcade_runs
    (id, player_id, request_id, game_id, rules_version, character_slug,
     seed, track_width, status, score, ticks, passed, replay_hash,
     started_at, expires_at, completed_at, created_at, updated_at)
VALUES
    ('22222222-2222-4222-8222-222222222222',
     '11111111-1111-4111-8111-111111111111',
     '33333333-3333-4333-8333-333333333333', 'dino-run', 'restore-fixture',
     'darya', 12345, 420, 'verified', 42, 100, 1, REPEAT('b',64),
     @fixture_started_at,
     DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 MINUTE),
     UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP());

INSERT INTO arcade_replays (run_id, transitions, created_at)
VALUES ('22222222-2222-4222-8222-222222222222',
        '[{"tick":0,"mask":1}]', UTC_TIMESTAMP());

INSERT INTO arcade_leaderboard_entries
    (player_id, run_id, game_id, rules_version, period_key, score, achieved_at)
VALUES
    ('11111111-1111-4111-8111-111111111111',
     '22222222-2222-4222-8222-222222222222',
     'dino-run', 'restore-fixture', 'all', 42,
     @fixture_started_at);
SQL

php artisan arcade:integrity --json
mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" \
    --single-transaction --quick --set-gtid-purged=OFF --no-tablespaces \
    "$DB_DATABASE" > "$tmp/snapshot.sql"
test -s "$tmp/snapshot.sql"
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" -e \
    'DROP DATABASE IF EXISTS demian_restore_test; CREATE DATABASE demian_restore_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" demian_restore_test < "$tmp/snapshot.sql"
DB_DATABASE=demian_restore_test php artisan arcade:integrity --json

count="$(mysql -N -B -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" \
    demian_restore_test -e \
    'SELECT (SELECT COUNT(*) FROM arcade_players) + (SELECT COUNT(*) FROM arcade_runs) + (SELECT COUNT(*) FROM arcade_replays) + (SELECT COUNT(*) FROM arcade_leaderboard_entries)')"
[[ "$count" == 4 ]] || { echo "Snapshot data missing after restore" >&2; exit 1; }

# Verify FK cascade behavior in the restored disposable schema, never source.
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" demian_restore_test -e \
    "DELETE FROM arcade_players WHERE id='11111111-1111-4111-8111-111111111111'"
remaining="$(mysql -N -B -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USERNAME" \
    demian_restore_test -e \
    'SELECT (SELECT COUNT(*) FROM arcade_runs) + (SELECT COUNT(*) FROM arcade_replays) + (SELECT COUNT(*) FROM arcade_leaderboard_entries)')"
[[ "$remaining" == 0 ]] || { echo "Foreign-key cascade broken after restore" >&2; exit 1; }
DB_DATABASE=demian_restore_test php artisan arcade:integrity --json
echo "Mobile-11 MySQL dump/restore: four linked records restored, FK cascades verified."
