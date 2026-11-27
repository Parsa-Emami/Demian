<?php

namespace Tests\Unit;

use App\Services\Arcade\DriftPrizeReadiness as Gate;
use Carbon\CarbonImmutable;
use PHPUnit\Framework\TestCase;

final class DriftPrizeReadinessTest extends TestCase
{
    public function test_only_complete_current_version_attestation_can_pass(): void
    {
        $gate = new Gate;
        $hashes = array_fill_keys(Gate::FILES, str_repeat('a', 64));
        ksort($hashes, SORT_STRING);
        $evidence = ['schema' => 1, 'policy' => Gate::VERSION, 'rules_version' => 'cafe-drift-replay-v1',
            'status' => 'approved', 'reviewer' => 'test reviewer', 'evidence_reference' => 'test evidence',
            'reviewed_on' => '2026-11-20', 'eligible_from' => '2026-11-21',
            'independent_pilot_participants' => 20, 'source_hashes' => $hashes,
            'checks' => array_fill_keys(Gate::REVIEW_CHECKS, true)];
        $now = CarbonImmutable::parse('2026-11-21T12:00:00Z');
        $this->assertTrue($gate->evidenceValid($evidence, $hashes, $now));
        $this->assertFalse($gate->evidenceValid($evidence, $hashes, $now->subDay()));
        $this->assertFalse($gate->evidenceValid($evidence, $hashes, $now->addDays(90)));
        $this->assertFalse($gate->evidenceValid([...$evidence, 'status' => 'pending'], $hashes, $now));
        $this->assertFalse($gate->evidenceValid([...$evidence, 'eligible_from' => '2026-11-22'], $hashes, $now));
        $this->assertFalse($gate->evidenceValid([...$evidence, 'independent_pilot_participants' => 19], $hashes, $now));
        $this->assertFalse($gate->evidenceValid([...$evidence, 'checks' => [...$evidence['checks'], 'physical_ios_touch' => false]], $hashes, $now));
        $changed = $hashes;
        $changed[Gate::FILES[0]] = str_repeat('b', 64);
        $this->assertFalse($gate->evidenceValid($evidence, $changed, $now));
        $this->assertFalse($gate->evidenceValid($evidence,[],$now));
    }
}
