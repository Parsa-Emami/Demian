<?php

namespace App\Console\Commands;

use App\Services\Arcade\RetentionReport;
use Illuminate\Console\Command;

final class ArcadeRetentionCommand extends Command
{
    protected $signature = 'arcade:retention {--days=90} {--json}';
    protected $description = 'Read aggregated D1/D7/D30 verified-play retention without exporting player identifiers';

    public function handle(RetentionReport $report): int
    {
        $result = $report->snapshot((int) $this->option('days'));
        $this->line(json_encode($result, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
        return $result['truncated'] ? self::FAILURE : self::SUCCESS;
    }
}
