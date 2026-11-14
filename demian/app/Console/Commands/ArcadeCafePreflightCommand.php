<?php

namespace App\Console\Commands;

use App\Services\Arcade\CafeProductionReadiness;
use Illuminate\Console\Command;

final class ArcadeCafePreflightCommand extends Command
{
    protected $signature = 'arcade:cafe:preflight
        {--target= : Expected deployment environment, staging or production}
        {--require-live : Fail unless in-cafe issuance, staff and policy are live-ready}
        {--json : Show nonsecret machine-readable check results}';

    protected $description = 'Read-only Phase 10 production/cafe readiness gate.';

    public function handle(CafeProductionReadiness $readiness): int
    {
        $target = $this->option('target');
        if ($target !== null && ! in_array($target, ['staging', 'production'], true)) {
            $this->error('Invalid target; use staging or production.');

            return self::FAILURE;
        }
        $result = $readiness->inspect((bool) $this->option('require-live'), $target);
        if ($this->option('json')) {
            $this->line(json_encode($result, JSON_THROW_ON_ERROR));
        } else {
            $this->line('Cafe preflight: '.$result['status'].' ('.$result['mode'].')');
            foreach ($result['checks'] as $check) {
                $this->line(($check['passed'] ? '[ok] ' : '[fail] ').$check['check']);
            }
        }

        return $result['status'] === 'passed' ? self::SUCCESS : self::FAILURE;
    }
}
