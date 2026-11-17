<?php

namespace Tests\Feature;

use App\Models\ArcadePlayer;
use App\Models\ArcadeRun;
use App\Services\Arcade\ReplayCompletionService;
use Domain\Arcade\VerifiedReplay;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

final class ReplayCompletionIsolationTest extends TestCase
{
    use RefreshDatabase;

    private function prepared(): array
    {
        $created = $this->postJson('/api/v1/arcade/players', ['display_name' => 'Isolation Probe'])->assertCreated()->json();
        $player = ArcadePlayer::query()->findOrFail($created['player_id']);
        $run = ArcadeRun::query()->create(['player_id' => $player->id, 'request_id' => (string) Str::uuid(),
            'game_id' => 'dino-run', 'rules_version' => 'test-rules', 'character_slug' => 'darya',
            'seed' => 7, 'track_width' => 420, 'status' => 'started',
            'started_at' => now()->subSeconds(10), 'expires_at' => now()->addMinutes(5)]);
        $run->refresh();
        $proof = new VerifiedReplay($run->getRawOriginal(), hash('sha256', 'proof'),
            ['score' => 48, 'ticks' => 65, 'passed' => 0], [['tick' => 0, 'mask' => 3]]);
        return [$player, $run, $proof];
    }

    public function test_invalid_cpu_proof_is_rejected_before_any_completion_transaction_opens(): void
    {
        $identity = $this->postJson('/api/v1/arcade/players', ['display_name' => 'CPU Probe'])->assertCreated()->json();
        $headers = ['Authorization' => 'Bearer '.$identity['token']];
        $rules = app(\App\Services\Arcade\RunnerReplayVerifier::class)->rules();
        $run = $this->postJson('/api/v1/arcade/runs', ['request_id' => (string) Str::uuid(),
            'game_id' => 'dino-run', 'character_slug' => 'darya', 'track_width' => 420,
            'rules_version' => $rules['version']], $headers)->assertCreated()->json();
        $begins = 0;
        \Illuminate\Support\Facades\Event::listen(\Illuminate\Database\Events\TransactionBeginning::class,
            function () use (&$begins): void { $begins++; });
        $this->postJson('/api/v1/arcade/runs/'.$run['run_id'].'/complete', [
            'ticks' => 1, 'transitions' => [['tick' => 0, 'mask' => 3]],
        ], $headers)->assertStatus(422);
        $this->assertSame(0, $begins);
    }

    public function test_changed_identity_between_cpu_verification_and_commit_is_rejected(): void
    {
        [$player, $run, $proof] = $this->prepared();
        $run->update(['seed' => 8]);
        try {
            app(ReplayCompletionService::class)->commit($player, $proof, fn () => null);
            $this->fail('Stale proof was accepted.');
        } catch (HttpException $error) { $this->assertSame(409, $error->getStatusCode()); }
        $this->assertDatabaseCount('arcade_replays', 0);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 0);
    }

    public function test_eligibility_is_rechecked_under_lock_and_failure_is_atomic(): void
    {
        [$player, $run, $proof] = $this->prepared();
        try {
            app(ReplayCompletionService::class)->commit($player, $proof, function ($current): void {
                $this->assertGreaterThan(0, \DB::transactionLevel());
                abort(410, 'Expired during verification.');
            });
            $this->fail('Expired proof was accepted.');
        } catch (HttpException $error) { $this->assertSame(410, $error->getStatusCode()); }
        $this->assertSame('started', $run->fresh()->status);
        $this->assertDatabaseCount('arcade_replays', 0);
    }

    public function test_duplicate_completion_cannot_duplicate_evidence_or_leaderboard_rows(): void
    {
        [$player, $run, $proof] = $this->prepared();
        $service = app(ReplayCompletionService::class);
        $first = $service->commit($player, $proof, fn () => null);
        $second = $service->commit($player, $proof, fn () => $this->fail('Idempotent retry must not reauthorize'));
        $this->assertSame($first->score, $second->score);
        $this->assertDatabaseCount('arcade_replays', 1);
        $this->assertDatabaseCount('arcade_leaderboard_entries', 3);
        $different = new VerifiedReplay($proof->identity, hash('sha256', 'different'), $proof->score, $proof->evidence);
        $this->expectException(HttpException::class);
        $service->commit($player, $different, fn () => null);
    }
}
