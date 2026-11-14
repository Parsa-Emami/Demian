<?php

namespace Tests\Feature;

use App\Services\Arcade\AfterHoursMechanicsReplayAudit;
use Illuminate\Validation\ValidationException;
use Symfony\Component\Process\Process;
use Tests\TestCase;

final class AfterHoursMechanicsAuditTest extends TestCase
{
    private function proof(int $seed = 7): array
    {
        $process = new Process([
            'node', base_path('tools/generate_route_replay_fixtures.mjs'),
            'after-hours', (string)$seed,
        ]);
        $process->setTimeout(45);
        $process->mustRun();
        $result = json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR)[0];
        return [
            'seed'=>$seed, 'ticks'=>$result['ticks'],
            'actions'=>array_map(static function (array $action): array {
                if ($action['kind'] === 'checkpoint') {
                    return ['tick'=>$action['tick'], 'kind'=>'interact'];
                }
                return $action;
            }, $result['actions']),
        ];
    }

    public function test_original_card_and_exit_mechanics_are_computed_without_awarding_prizes(): void
    {
        $proof = $this->proof(7);
        $result = app(AfterHoursMechanicsReplayAudit::class)->audit(
            $proof['seed'], $proof['ticks'], $proof['actions']);
        $this->assertSame(2, $result['cards']);
        $this->assertGreaterThan(1000, $result['candidate_score']);
        $this->assertFalse($result['relic']);
        $this->assertFalse($result['shadow_verified']);
        $this->assertFalse($result['eligible_for_ranked']);
    }

    public function test_original_escape_audit_rejects_forged_power_change(): void
    {
        $proof = $this->proof();
        $proof['actions'][0] = ['tick'=>0, 'kind'=>'power', 'target'=>'exit'];
        $this->expectException(ValidationException::class);
        app(AfterHoursMechanicsReplayAudit::class)->audit(
            $proof['seed'], $proof['ticks'], $proof['actions']);
    }

    public function test_original_escape_audit_rejects_wall_teleport(): void
    {
        $proof = $this->proof();
        $proof['actions'][1]['x'] += 40;
        $this->expectException(ValidationException::class);
        app(AfterHoursMechanicsReplayAudit::class)->audit(
            $proof['seed'], $proof['ticks'], $proof['actions']);
    }

    public function test_original_escape_audit_rejects_missing_card(): void
    {
        $proof = $this->proof();
        $first = array_search('interact', array_column($proof['actions'], 'kind'), true);
        $this->assertIsInt($first);
        array_splice($proof['actions'], $first, 1);
        $this->expectException(ValidationException::class);
        app(AfterHoursMechanicsReplayAudit::class)->audit(
            $proof['seed'], $proof['ticks'], $proof['actions']);
    }

    public function test_original_escape_audit_rejects_events_after_terminal_exit(): void
    {
        $proof = $this->proof();
        $proof['actions'][] = ['tick'=>$proof['ticks'], 'kind'=>'move',
            'x'=>0.4, 'z'=>-3.9];
        $this->expectException(ValidationException::class);
        app(AfterHoursMechanicsReplayAudit::class)->audit(
            $proof['seed'], $proof['ticks']+1, $proof['actions']);
    }
}
