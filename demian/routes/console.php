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
