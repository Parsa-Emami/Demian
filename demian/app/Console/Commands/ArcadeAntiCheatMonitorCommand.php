<?php

namespace App\Console\Commands;

use App\Services\Arcade\ArcadeAntiCheat;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

final class ArcadeAntiCheatMonitorCommand extends Command
{
    protected $signature = 'arcade:anticheat:monitor {--json : Print sanitized monitoring counters}
        {--max-high=5 : Alert threshold for unresolved high-severity reports}';
    protected $description = 'Read-only anti-cheat monitoring and operator review alert gate';

    public function handle(ArcadeAntiCheat $antiCheat): int
    {
        try {
            $summary = $antiCheat->dashboard();
            $threshold = filter_var($this->option('max-high'),
                FILTER_VALIDATE_INT, ['options'=>['min_range'=>0]]);
            if ($threshold === false) {
                $this->error('Invalid --max-high');
                return self::FAILURE;
            }
            $summary['status'] = ! $summary['enabled'] ? 'disabled'
                : ($summary['high_priority'] >= max(1,$threshold)
                    ? 'review_required' : 'ok');
        } catch (Throwable $e) {
            report($e);
            $summary = ['status'=>'unavailable'];
        }
        if ($this->option('json')) $this->line(json_encode($summary, JSON_THROW_ON_ERROR));
        else $this->info('Anti-cheat monitoring: '.$summary['status']);
        if ($summary['status'] === 'review_required') {
            // Only aggregate counts reach standard logs and alerts.
            Log::warning('Arcade anti-cheat human review backlog', [
                'high_priority' => $summary['high_priority'],
                'unresolved' => $summary['unresolved'],
            ]);
        }
        return in_array($summary['status'], ['ok','disabled'], true)
            ? self::SUCCESS : self::FAILURE;
    }
}
