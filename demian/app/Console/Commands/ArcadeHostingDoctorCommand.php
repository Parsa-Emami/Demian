<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Read-only, private host readiness proof AFTER additive migrations.
 * Does not create players, write into financial ledgers, print .env or store
 * temporary cache keys. A healthy CLI alone never proves PHP-FPM parity.
 */
final class ArcadeHostingDoctorCommand extends Command
{
    protected $signature = 'arcade:hosting:doctor
        {--target= : staging or production deployment target}
        {--json : Print only bounded non-secret check identifiers}';

    protected $description = 'Validate an immutable cPanel Laravel API after migrations and before cutover.';

    public function handle(): int
    {
        $target = (string) $this->option('target');
        if (!in_array($target, ['staging', 'production'], true)) {
            $this->error('A staging or production target is required.');
            return self::FAILURE;
        }
        $checks = [];
        $add = static function (string $key, bool $passed) use (&$checks): void {
            $checks[$key] = $passed;
        };
        $add('environment', app()->environment($target));
        $add('php84_64bit', PHP_VERSION_ID >= 80400 && PHP_INT_SIZE === 8);
        $add('debug_disabled', config('app.debug') === false);
        $url = (string) config('app.url');
        $add('https_origin', preg_match('~^https://[a-z0-9.-]+(?::[0-9]{2,5})?$~iD', $url) === 1);
        $add('api_only', config('demian-arcade.api_only') === true);
        $add('mysql_driver', config('database.default') === 'mysql');
        $add('database_session', config('session.driver') === 'database');
        $add('persistent_queue', config('queue.default') === 'database');
        $add('persistent_cache', config('cache.default') === 'database');
        $add('secure_staff_cookie', config('session.secure') === true);
        $add('online_shop_disabled', config('demian-coupons.shop_enabled') === false);
        $add('release_marker', is_file(base_path('.mobile11-release'))
            && preg_match('/^[0-9a-f]{40}$/D',
                trim((string) @file_get_contents(base_path('.mobile11-release')))) === 1);

        $shared = realpath(storage_path());
        $public = realpath(public_path());
        $add('persistent_storage_outside_public',
            $shared !== false && $public !== false
            && !str_starts_with($shared.'/', $public.'/'));
        foreach (['framework/cache/data', 'framework/views',
            'framework/sessions', 'logs'] as $folder) {
            $add('writable_'.str_replace('/', '_', $folder),
                is_dir(storage_path($folder)) && is_writable(storage_path($folder)));
        }
        $free = $shared === false ? false : @disk_free_space($shared);
        $add('storage_512m_available', $free !== false && $free >= 536870912);

        try {
            DB::select('SELECT 1');
            $add('database_connects', true);
            foreach (['migrations', 'cache', 'jobs', 'sessions', 'arcade_players',
                'arcade_runs', 'arcade_leaderboard_entries', 'arcade_replays',
                'arcade_coupons', 'arcade_cheat_reports',
                'arcade_player_phone_challenges', 'arcade_cheat_appeals'] as $table) {
                $add('table_'. $table, Schema::hasTable($table));
            }
            $existing = DB::table('migrations')->pluck('migration')->all();
            $files = glob(database_path('migrations/*.php')) ?: [];
            $pending = array_filter($files,
                static fn (string $file): bool =>
                    !in_array(pathinfo($file, PATHINFO_FILENAME), $existing, true));
            $add('no_pending_migrations', count($pending) === 0);
        } catch (\Throwable) {
            $add('database_connects', false);
            $add('no_pending_migrations', false);
        }
        try {
            Cache::get('demian:host:doctor:read-only');
            $add('cache_readable', true);
        } catch (\Throwable) {
            $add('cache_readable', false);
        }

        // Financial features are independent deployment gates. Do not allow
        // an operator to bypass Phase 9 identity proof via an env flag.
        if ($target === 'production') {
            $financial = config('demian-coupons.issue_enabled') === true
                || config('demian-coupons.auto_issue_enabled') === true
                || config('demian-coupons.manual_gifts_enabled') === true
                || config('demian-coupons.cafe_enabled') === true
                || config('demian-arcade.weekly_auto_awards_enabled') === true;
            $add('finance_identity_gate',
                !$financial || (config('demian-arcade.prize_identity_required') === true
                    && app(\App\Services\Arcade\SmsOtpGateway::class)->ready()
                    && config('demian-legal.publication_approved') === true
                    && config('demian-legal.require_acceptance') === true));
        }

        $failed = array_keys(array_filter($checks, static fn (bool $value): bool => !$value));
        $payload = [
            'status' => $failed === [] ? 'passed' : 'failed',
            'mode' => 'private-cpanel-after-migrations',
            'target' => $target,
            'checks' => $checks,
            'failed' => $failed,
            'note' => 'CLI evidence only; live PHP-FPM, TLS, cron, backup and host capacity remain independent gates.',
        ];
        if ($this->option('json')) {
            $this->line(json_encode($payload, JSON_THROW_ON_ERROR));
        } else {
            $this->line('cPanel readiness: '.$payload['status']);
            foreach ($checks as $key => $ok) {
                $this->line(($ok ? '[ok] ' : '[fail] ').$key);
            }
        }

        return $failed === [] ? self::SUCCESS : self::FAILURE;
    }
}
