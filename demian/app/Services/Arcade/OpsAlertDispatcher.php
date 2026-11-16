<?php

namespace App\Services\Arcade;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Fixed-code, deduplicated notifications. Never sends PII, request traces,
 * raw IPs, URLs, credentials, coupon values or exception text.
 */
final class OpsAlertDispatcher
{
    public function dispatch(array $report): array
    {
        if (($report['enabled'] ?? false) !== true) return [];
        $sent = [];
        $allowed = [
            'database_unavailable', 'cache_unavailable', 'cron_stale',
            'storage_unavailable', 'disk_low', 'api_latency_high',
            'api_error_rate_high', 'game_load_high',
        ];
        $email = (string) config('demian-ops.alert_email', '');
        foreach (array_values(array_unique($report['alerts'] ?? [])) as $code) {
            if (! in_array($code, $allowed, true)) continue;
            $key = 'demian:ops:alert:v1:'.$code;
            try {
                if (! Cache::add($key, 1,
                    (int) config('demian-ops.alert_cooldown_seconds', 1800))) continue;
            } catch (\Throwable) {
                // With cache unavailable deduplication is impossible. Emit an
                // operator log but do not flood email every Cron invocation.
                $this->log('alert_dedup_unavailable', $code);
                continue;
            }
            $this->log('ops_alert', $code);
            $sent[] = $code;
            if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
                try {
                    Mail::raw(
                        "Demian observability alert: {$code}\n"
                        ."Host: api.demiancafe.ir\n"
                        ."No private diagnostics are included. Inspect the protected "
                        ."cashier operations dashboard or run artisan arcade:ops:check --json.",
                        function ($message) use ($email): void {
                            $message->to($email)->subject('Demian operations alert');
                        }
                    );
                } catch (\Throwable) {
                    $this->log('alert_delivery_failed', $code);
                }
            }
        }
        return $sent;
    }

    private function log(string $event, string $code): void
    {
        try {
            Log::channel('demian_ops')->warning('operations', [
                'event' => $event, 'code' => $code,
            ]);
        } catch (\Throwable) { /* Alerts cannot interfere with gameplay. */ }
    }
}
