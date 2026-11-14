<?php

namespace App\Console\Commands;

use App\Services\Arcade\ArcadeAntiCheat;
use Illuminate\Console\Command;

final class ArcadeAntiCheatPruneCommand extends Command
{
    protected $signature = 'arcade:anticheat:prune {--json : Machine-readable retention counts}';
    protected $description = 'Prune short-lived pseudonymous observations and expired manual holds';

    public function handle(ArcadeAntiCheat $antiCheat): int
    {
        $result=$antiCheat->prune();
        $this->line($this->option('json')
            ? json_encode($result, JSON_THROW_ON_ERROR)
            : 'Pruned '.$result['observations'].' observations and '.
                $result['expired_holds'].' expired holds.');
        return self::SUCCESS;
    }
}
