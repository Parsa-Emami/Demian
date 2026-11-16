<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

\Illuminate\Support\Facades\Artisan::command('arcade:prune', function (): void {
    $expired = \Illuminate\Support\Facades\DB::table('arcade_runs')->where('status', 'started')->where('expires_at', '<', now())->update(['status' => 'expired', 'updated_at' => now()]);
    $replays = \Illuminate\Support\Facades\DB::table('arcade_replays')->where('created_at', '<', now()->subDays((int) config('demian-arcade.replay_retention_days', 30)))->delete();
    $this->info("Expired runs: {$expired}; pruned replays: {$replays}");
})->purpose('Expire abandoned arcade runs and remove old replay payloads.');

\Illuminate\Support\Facades\Schedule::command('arcade:prune')->daily()->withoutOverlapping();


// Preparing upcoming periods does not seal results or issue vouchers.
\Illuminate\Support\Facades\Schedule::command('arcade:prepare-weeks --apply')
    ->dailyAt('02:00')->timezone('Asia/Tehran')
    ->withoutOverlapping(30)->onOneServer()
    ->when(fn (): bool => (bool) config('demian-arcade.weekly_management_enabled', false));

// Snapshot-only: no vouchers are issued. Enable only after reviewing policy,
// verifying a persistent shared lock cache and completing production migration.
\Illuminate\Support\Facades\Schedule::command('arcade:seal-weeks --apply')
    ->hourlyAt(10)->withoutOverlapping(30)->onOneServer()
    ->when(fn (): bool => (bool) config('demian-arcade.weekly_settlement_enabled', false)
        && ! (bool) config('demian-arcade.weekly_auto_awards_enabled', false));

\Illuminate\Support\Facades\Schedule::command('arcade:issue-pending-coupons --apply')
    ->hourlyAt(25)->withoutOverlapping(30)->onOneServer()
    ->when(fn (): bool => (bool) config('demian-coupons.auto_issue_enabled', false)
        && (bool) config('demian-coupons.issue_enabled', false)
        && (bool) config('demian-coupons.policy_approved', false)
        && ! (bool) config('demian-arcade.weekly_auto_awards_enabled', false));


\Illuminate\Support\Facades\Schedule::command('arcade:finalize-weekly-awards --apply --json')
    ->everyFiveMinutes()->withoutOverlapping(30)->onOneServer()
    ->when(fn (): bool => (bool) config('demian-arcade.weekly_auto_awards_enabled', false)
        && (bool) config('demian-arcade.weekly_management_enabled', false)
        && (bool) config('demian-arcade.weekly_settlement_enabled', false)
        && (bool) config('demian-coupons.auto_issue_enabled', false)
        && (bool) config('demian-coupons.issue_enabled', false)
        && (bool) config('demian-coupons.campaigns_enabled', false)
        && (bool) config('demian-coupons.policy_approved', false));

// General anti-cheat is opt-in; production must provide a real persistent
// cache/cron runner and review staff. No prize/score mutation is scheduled.
\Illuminate\Support\Facades\Schedule::command('arcade:anticheat:monitor --json')
    ->everyFifteenMinutes()->withoutOverlapping(10)->onOneServer()
    ->when(fn (): bool => (bool) config('demian-arcade.anticheat.enabled', false));
\Illuminate\Support\Facades\Schedule::command('arcade:anticheat:prune --json')
    ->dailyAt('03:40')->withoutOverlapping(30)->onOneServer()
    ->when(fn (): bool => (bool) config('demian-arcade.anticheat.enabled', false));


// Step 33: opt-in and cheap. A database-backed cache works on cPanel;
// there is no requirement for Redis, a daemon or external telemetry vendor.
\Illuminate\Support\Facades\Artisan::command('arcade:ops:heartbeat {--json}', function (): int {
    if (config('demian-ops.enabled') !== true) {
        $this->line('Observability disabled.');
        return 0;
    }
    try {
        \Illuminate\Support\Facades\Cache::put(
            \App\Services\Arcade\OpsReport::HEARTBEAT,
            now()->timestamp,
            now()->addMinutes(20)
        );
        if ($this->option('json')) $this->line('{"status":"ok","heartbeat":true}');
        else $this->info('Observability heartbeat recorded.');
        return 0;
    } catch (\Throwable) {
        $this->error('Heartbeat failed. Inspect private application logs.');
        return 1;
    }
})->purpose('Record a private, expiring Cron heartbeat for operational alerts.');

\Illuminate\Support\Facades\Artisan::command('arcade:ops:check {--json}',
    function (\App\Services\Arcade\OpsReport $report,
        \App\Services\Arcade\OpsAlertDispatcher $alerts): int {
        $status = $report->snapshot();
        $sent = $alerts->dispatch($status);
        $status['alert_notifications_triggered'] = $sent;
        if ($this->option('json')) {
            $this->line(json_encode($status, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
        } else {
            $this->info('Operations status: '.$status['status']);
            foreach ($status['alerts'] as $alert) $this->warn($alert);
        }
        return $status['status'] === 'degraded' ? 1 : 0;
    }
)->purpose('Inspect sanitized API metrics, Cron, MySQL, cache and disk; deduplicate alerts.');

\Illuminate\Support\Facades\Schedule::command('arcade:ops:heartbeat --json')
    ->everyFiveMinutes()->withoutOverlapping(5)->onOneServer()
    ->when(fn (): bool => config('demian-ops.enabled') === true);
\Illuminate\Support\Facades\Schedule::command('arcade:ops:check --json')
    ->everyFiveMinutes()->withoutOverlapping(5)->onOneServer()
    ->when(fn (): bool => config('demian-ops.enabled') === true);
