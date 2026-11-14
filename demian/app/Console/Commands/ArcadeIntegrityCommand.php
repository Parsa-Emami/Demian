<?php

namespace App\Console\Commands;

use App\Services\Arcade\ArcadeIntegrityAudit;
use Illuminate\Console\Command;
use Throwable;

final class ArcadeIntegrityCommand extends Command
{
    protected $signature = 'arcade:integrity {--json : Print a machine-readable summary}';
    protected $description = 'Read-only consistency audit of verified runs and rankings';

    public function handle(ArcadeIntegrityAudit $audit): int
    {
        try {
            $result = $audit->inspect();
        } catch (Throwable $error) {
            report($error);
            $result = ['status' => 'unavailable', 'checks' => []];
        }

        if ($this->option('json')) {
            $this->line(json_encode($result, JSON_THROW_ON_ERROR));
        } else {
            $this->info('Arcade integrity: '.$result['status']);
            foreach ($result['checks'] as $name => $count) $this->line("{$name}: {$count}");
        }

        return $result['status'] === 'ok' ? self::SUCCESS : self::FAILURE;
    }
}
