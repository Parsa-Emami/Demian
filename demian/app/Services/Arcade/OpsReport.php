<?php

namespace App\Services\Arcade;

use DateTimeImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Read-only, capped on-disk metrics aggregation, appropriate for small cPanel
 * hosts without a queue worker, Redis, Prometheus or per-request SQL writes.
 *
 * All log fields are fixed allowlist dimensions. P95 is over *observed*
 * request samples, not a falsely claimed population-wide percentile.
 */
final class OpsReport
{
    public const HEARTBEAT = 'demian:ops:cron-heartbeat';

    public function snapshot(): array
    {
        $enabled = config('demian-ops.enabled') === true;
        $checks = [];
        $alerts = [];
        $add = static function (string $key, bool $ok) use (&$checks, &$alerts): void {
            $checks[] = ['code' => $key, 'passed' => $ok];
            if (! $ok) $alerts[] = $key;
        };

        if (! $enabled) {
            return [
                'status' => 'disabled', 'enabled' => false,
                'window_minutes' => config('demian-ops.window_minutes', 15),
                'checks' => [], 'alerts' => [], 'metrics' => self::aggregate([]),
                'note' => 'Observability must be explicitly enabled after staging and private storage setup.',
            ];
        }

        try {
            DB::select('SELECT 1');
            DB::table('arcade_players')->limit(1)->exists();
            $add('database_unavailable', true);
        } catch (\Throwable) {
            $add('database_unavailable', false);
        }

        try {
            Cache::store()->get('demian:ops:cache-probe');
            $add('cache_unavailable', true);
        } catch (\Throwable) {
            $add('cache_unavailable', false);
        }

        try {
            $heartbeat = Cache::get(self::HEARTBEAT);
            $age = is_numeric($heartbeat) ? max(0, now()->timestamp - (int) $heartbeat) : null;
            $add('cron_stale', $age !== null
                && $age <= (int) config('demian-ops.heartbeat_max_age_seconds', 600));
        } catch (\Throwable) {
            $age = null;
            $add('cron_stale', false);
        }

        $logDir = (string) config('demian-ops.log_directory', storage_path('logs'));
        $free = @disk_free_space(storage_path());
        $add('storage_unavailable', is_dir($logDir) && is_writable($logDir));
        $add('disk_low', is_int($free) || is_float($free)
            ? $free >= (int) config('demian-ops.disk_min_free_bytes')
            : false);

        $metrics = $this->collect((int) config('demian-ops.window_minutes', 15));
        $estimated = (float) $metrics['estimated_requests'];
        if ($metrics['http_samples'] >= (int) config('demian-ops.minimum_http_samples', 20)) {
            if ($metrics['http_p95_ms'] !== null
                && $metrics['http_p95_ms'] > (int) config('demian-ops.http_p95_budget_ms', 1000)) {
                $alerts[] = 'api_latency_high';
            }
            if ($estimated >= 1
                && $metrics['http_5xx'] / $estimated > (float) config('demian-ops.error_rate_budget', 0.01)) {
                $alerts[] = 'api_error_rate_high';
            }
        }
        if ($metrics['game_load_samples'] >= 10 && $metrics['game_load_p95_ms'] !== null
            && $metrics['game_load_p95_ms'] > (int) config('demian-ops.game_load_budget_ms', 3000)) {
            $alerts[] = 'game_load_high';
        }

        foreach ($metrics['game_load_by_game'] as $game) {
            if ($game['samples'] >= 10 && $game['p95_ms'] >= (int) config('demian-ops.game_load_budget_ms', 3000)) $alerts[] = 'game_load_high';
        }
        $alerts = array_values(array_unique($alerts));
        return [
            'status' => $alerts ? 'degraded' : 'ok',
            'enabled' => true,
            'window_minutes' => (int) config('demian-ops.window_minutes', 15),
            'checked_at' => now()->toIso8601String(),
            'cron_age_seconds' => $age, 'disk_free_mb' => is_numeric($free)
                ? (int) floor($free / 1048576) : null,
            'checks' => $checks, 'alerts' => $alerts, 'metrics' => $metrics,
            'note' => 'SLO measurements are sampled, approximate, and NOT a host capacity certification.',
        ];
    }

    public function collect(int $minutes = 15): array
    {
        $minutes = max(1, min(120, $minutes));
        $since = now()->timestamp - $minutes * 60;
        $entries = [];
        $directory = (string) config('demian-ops.log_directory', storage_path('logs'));
        $maxBytes = (int) config('demian-ops.max_log_bytes_per_day', 2 * 1024 * 1024);
        $maxRecords = (int) config('demian-ops.max_log_records', 5000);
        foreach ([now()->timestamp - 86400, now()->timestamp] as $day) {
            $file = rtrim($directory, '/').'/demian-ops-'.date('Y-m-d', $day).'.log';
            if (! is_file($file) || is_link($file) || ! is_readable($file)) continue;
            $handle = @fopen($file, 'rb');
            if (! $handle) continue;
            try {
                $size = @filesize($file);
                if ($size === false) continue;
                if ($size > $maxBytes) {
                    // Never read arbitrary multi-GB logs into a PHP worker.
                    fseek($handle, -$maxBytes, SEEK_END);
                    fgets($handle); // Discard incomplete first line.
                }
                while (! feof($handle) && count($entries) < $maxRecords) {
                    $line = fgets($handle, 4096);
                    if ($line === false) break;
                    if (! str_ends_with($line, "\n") && ! feof($handle)) {
                        // Overlong/untrusted record: discard its remainder.
                        while (($part = fgets($handle, 4096)) !== false
                            && ! str_ends_with($part, "\n")) {}
                        continue;
                    }
                    $entry = json_decode($line, true);
                    if (! is_array($entry)) continue;
                    $timestamp = $entry['datetime'] ?? null;
                    try {
                        if (! is_string($timestamp) || (new DateTimeImmutable($timestamp))->getTimestamp() < $since) continue;
                    } catch (\Throwable) { continue; }
                    $context = $entry['context'] ?? null;
                    if (! is_array($context)
                        || ! in_array($entry['message'] ?? null, ['api_request', 'client_metric'], true)) continue;
                    $entries[] = [
                        'event' => ($entry['message'] === 'api_request') ? 'http' : 'client',
                        ...$context,
                    ];
                }
            } finally { fclose($handle); }
        }
        $result = self::aggregate($entries);
        $result['truncated'] = count($entries) >= $maxRecords;
        return $result;
    }

    /**
     * Pure aggregator allows deterministic tests without fragile system clocks,
     * logging drivers or an actual remote server.
     */
    public static function aggregate(array $entries): array
    {
        $http = []; $load = []; $groups = []; $fives = 0; $fours = 0;
        $slow = 0; $estimated = 0.; $clientErrors = 0; $frames = []; $gameLoads = []; $menu = [];
        foreach ($entries as $entry) {
            if (($entry['event'] ?? null) === 'http') {
                $status = (int) ($entry['status'] ?? 0);
                $ms = (int) ($entry['duration_ms'] ?? -1);
                if ($ms < 0 || $ms > 300000 || $status < 100 || $status > 599) continue;
                $http[] = $ms;
                if ($status >= 500) $fives++;
                elseif ($status >= 400) $fours++;
                if (($entry['slow'] ?? false) === true) $slow++;
                $weight = (float) ($entry['sample_weight'] ?? 1);
                $estimated += min(100.0, max(1., $weight));
                $group = $entry['route_group'] ?? 'other';
                if (! in_array($group, ['health', 'telemetry', 'run_complete', 'run_start',
                    'leaderboard', 'account', 'rewards', 'other'], true)) $group = 'other';
                $groups[$group] = ($groups[$group] ?? 0) + 1;
            } elseif (($entry['event'] ?? null) === 'client') {
                $kind = $entry['kind'] ?? '';
                $value = $entry['duration_ms'] ?? null;
                if ($kind === 'game_load' && is_int($value) && $value >= 0 && $value <= 60000) {
                    $load[] = $value;
                    $game = $entry['game'] ?? '';
                    if (in_array($game, ['open-world', 'dino-run', 'after-hours', 'cafe-rush', 'cafe-critters', 'coffee-crash'], true)) $gameLoads[$game][] = $value;
                }
                if ($kind === 'menu_ready' && is_int($value) && $value >= 0 && $value <= 60000) $menu[] = $value;
                if ($kind === 'game_error') $clientErrors++;
                if ($kind === 'fps' && isset($entry['fps']) && is_int($entry['fps'])
                    && $entry['fps'] >= 0 && $entry['fps'] <= 120) $frames[] = $entry['fps'];
            }
        }
        ksort($groups);
        ksort($gameLoads);
        $perGame = [];
        foreach ($gameLoads as $game => $values) {
            $perGame[$game] = ['samples' => count($values), 'p95_ms' => self::percentile($values, 95),
                'over_budget' => count(array_filter($values, static fn ($ms) => $ms >= 3000))];
        }
        return [
            'http_samples' => count($http), 'estimated_requests' => round($estimated, 2),
            'http_4xx' => $fours, 'http_5xx' => $fives, 'slow_samples' => $slow,
            'http_p95_ms' => self::percentile($http, 95), 'route_groups' => $groups,
            'game_load_samples' => count($load), 'game_load_p95_ms' => self::percentile($load, 95),
            'game_load_by_game' => $perGame, 'menu_ready_samples' => count($menu),
            'menu_ready_p95_ms' => self::percentile($menu, 95),
            'game_errors' => $clientErrors, 'fps_samples' => count($frames),
            'fps_p10' => self::percentile($frames, 10), 'truncated' => false,
        ];
    }

    private static function percentile(array $values, int $percent): ?int
    {
        if (! $values) return null;
        sort($values, SORT_NUMERIC);
        return $values[max(0, (int) ceil(count($values) * $percent / 100) - 1)];
    }
}
