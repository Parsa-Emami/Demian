<?php

namespace Tests\Feature;

use App\Services\Arcade\CafeRushGameplayReplayVerifier;
use Illuminate\Validation\ValidationException;
use Symfony\Component\Process\Process;
use Tests\TestCase;

/**
 * Step 09 independent server-side original Cafe Rush scoring parity baseline.
 * Does not turn on ranked submissions; model/trace acceptance is still gated.
 */
final class CafeRushGameplayProofTest extends TestCase
{
    private function legalProof(int $seed = 7): array
    {
        $node = new Process([
            'node', base_path('tools/generate_route_replay_fixtures.mjs'),
            'cafe-rush', (string)$seed,
        ]);
        $node->setTimeout(45);
        $node->mustRun();
        $fixture = json_decode($node->getOutput(), true, flags: JSON_THROW_ON_ERROR)[0];
        $actions = [];
        $offset = 0;
        $lastPosition = ['x'=>-0.35,'z'=>-25.3];

        foreach ($fixture['actions'] as $item) {
            $tick = $item['tick'] + $offset;
            if ($item['kind'] === 'move') {
                $lastPosition = ['x'=>$item['x'], 'z'=>$item['z']];
                $actions[] = ['tick'=>$tick, 'kind'=>'move', ...$lastPosition];
                continue;
            }
            // All checkpoint submissions are real interaction ATTEMPTS.
            // The SERVER decides whether the ticket, preparation or service is legal.
            $actions[] = ['tick'=>$tick, 'kind'=>'interact'];
            if (str_contains($item['target'], '-1-')) {
                // The preparation station cannot be picked up instantly:
                // wait long enough for standard cake/tea/espresso recipes.
                for ($step = 10; $step <= 120; $step += 10) {
                    $actions[] = ['tick'=>$tick+$step,
                        'kind'=>'move', ...$lastPosition];
                }
                $actions[] = ['tick'=>$tick+121, 'kind'=>'interact'];
                $offset += 122;
            }
        }
        $lastTick = $actions[array_key_last($actions)]['tick'];
        $this->assertLessThan(CafeRushGameplayReplayVerifier::TICKS - 30, $lastTick,
            'Fixture needs to complete before shift end.');
        for ($tick = $lastTick+10;
            $tick < CafeRushGameplayReplayVerifier::TICKS; $tick+=10) {
            $actions[] = ['tick'=>$tick, 'kind'=>'move', ...$lastPosition];
        }
        return ['ticks'=>CafeRushGameplayReplayVerifier::TICKS,
            'actions'=>$actions, 'seed'=>$seed];
    }

    public function test_original_ticket_and_combo_values_are_recomputed_from_legal_moves(): void
    {
        $proof = $this->legalProof();
        $result = app(CafeRushGameplayReplayVerifier::class)->verify(
            $proof['seed'], $proof['ticks'], $proof['actions']);
        $this->assertSame(200, $result['score']);
        $this->assertSame(2, $result['passed']);
        $this->assertSame(2, $result['details']['best_combo']);
        $this->assertFalse($result['details']['vip_served']);
        $this->assertSame(0, $result['details']['spills']);
    }

    public function test_original_proof_rejects_teleporting_across_walls(): void
    {
        $proof = $this->legalProof();
        $proof['actions'][3]['x'] += 30;
        $this->expectException(ValidationException::class);
        app(CafeRushGameplayReplayVerifier::class)->verify(
            $proof['seed'], $proof['ticks'], $proof['actions']);
    }

    public function test_original_proof_rejects_fabricated_time_and_invalid_events(): void
    {
        $proof = $this->legalProof();
        try {
            app(CafeRushGameplayReplayVerifier::class)->verify(
                $proof['seed'], 30, $proof['actions']);
            $this->fail('An instant order completion was accepted.');
        } catch (ValidationException $expected) {
            $this->assertArrayHasKey('replay', $expected->errors());
        }
        $proof['actions'][6]['kind'] = 'award-points';
        $this->expectException(ValidationException::class);
        app(CafeRushGameplayReplayVerifier::class)->verify(
            $proof['seed'], $proof['ticks'], $proof['actions']);
    }

    public function test_original_proof_rejects_out_of_order_and_repeated_ticks(): void
    {
        $proof = $this->legalProof();
        $proof['actions'][7]['tick'] = $proof['actions'][6]['tick'];
        $this->expectException(ValidationException::class);
        app(CafeRushGameplayReplayVerifier::class)->verify(
            $proof['seed'], $proof['ticks'], $proof['actions']);
    }

    public function test_original_proof_rejects_runs_without_legitimate_deliveries(): void
    {
        $actions = [];
        for ($tick=10; $tick < CafeRushGameplayReplayVerifier::TICKS; $tick+=10) {
            $actions[] = ['tick'=>$tick, 'kind'=>'move', 'x'=>-0.35, 'z'=>-25.3];
        }
        $this->expectException(ValidationException::class);
        app(CafeRushGameplayReplayVerifier::class)->verify(
            7, CafeRushGameplayReplayVerifier::TICKS, $actions);
    }
}
