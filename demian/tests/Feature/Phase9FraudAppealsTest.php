<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class Phase9FraudAppealsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    private function player(string $phone): array
    {
        return $this->postJson('/api/v1/arcade/players', [
            'display_name' => 'Player Appeals',
            'contact_type' => 'phone', 'contact_value' => $phone,
            'registration_key' => (string) Str::uuid(),
        ])->assertCreated()->json();
    }

    private function confirmedReport(string $playerId, string $state = 'confirmed'): int
    {
        return DB::table('arcade_cheat_reports')->insertGetId([
            'player_id' => $playerId, 'run_id' => null,
            'fingerprint' => hash('sha256', Str::random(64)),
            'signal' => 'invalid_replay_velocity',
            'severity' => 'high', 'risk_score' => 60,
            'status' => $state, 'evidence' => json_encode(['count' => 4]),
            'hits' => 4, 'first_seen' => now(), 'last_seen' => now(),
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_only_report_owner_can_appeal_and_existing_state_is_not_disclosed(): void
    {
        $a = $this->player('+989101234563');
        $b = $this->player('+989101234564');
        $report = $this->confirmedReport($a['player_id']);
        $payload = [
            'report_id' => $report, 'reason_code' => 'shared_network',
            'statement' => 'The cafe network is shared by many guests.',
        ];
        $this->postJson('/api/v1/arcade/player/fraud/appeals', $payload)->assertUnauthorized();
        $this->withToken($b['token'])
            ->postJson('/api/v1/arcade/player/fraud/appeals', $payload)
            ->assertNotFound();
        $this->assertDatabaseCount('arcade_cheat_appeals', 0);
        $this->withToken($a['token'])
            ->postJson('/api/v1/arcade/player/fraud/appeals', $payload)
            ->assertCreated()->assertJson(['status' => 'open', 'duplicate' => false]);
        $this->assertDatabaseCount('arcade_cheat_appeals', 1);
    }

    public function test_encrypted_single_appeal_has_auditable_event_and_private_owner_list(): void
    {
        $a = $this->player('+989101234560');
        $report = $this->confirmedReport($a['player_id']);
        $payload = [
            'report_id' => $report, 'reason_code' => 'replay_dispute',
            'statement' => 'I believe this replay verification was incorrect.',
        ];
        $created = $this->withToken($a['token'])
            ->postJson('/api/v1/arcade/player/fraud/appeals', $payload)
            ->assertCreated()->assertHeader('Cache-Control', 'no-store, private')->json();
        $stored = DB::table('arcade_cheat_appeals')->first();
        $this->assertNotSame($payload['statement'], $stored->statement_ciphertext);
        $this->assertStringNotContainsString('replay verification', $stored->statement_ciphertext);
        $this->assertDatabaseHas('arcade_cheat_review_events', [
            'report_id' => $report, 'actor_id' => null, 'action' => 'player_appealed',
        ]);
        $this->postJson('/api/v1/arcade/player/fraud/appeals',
            [...$payload, 'statement' => 'A second attempt must not overwrite.'])
            ->assertOk()->assertJson(['duplicate' => true]);
        $this->assertSame($created['appeal_id'], DB::table('arcade_cheat_appeals')->first()->id);
        $this->assertDatabaseCount('arcade_cheat_appeals', 1);
        $list = $this->getJson('/api/v1/arcade/player/fraud/appeals')
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json();
        $this->assertCount(1, $list['appeals']);
        $this->assertArrayNotHasKey('statement_ciphertext', $list['appeals'][0]);
        $this->assertArrayNotHasKey('statement', $list['appeals'][0]);
        $this->getJson('/api/v1/arcade/player/data')->assertOk()
            ->assertJsonPath('record_counts.fraud_appeals', 1);
        $this->getJson('/api/v1/arcade/player/data/records?type=fraud_appeals')
            ->assertOk()->assertJsonPath('type', 'fraud_appeals');
    }

    public function test_appeal_requires_actual_review_case_not_a_new_or_cleared_false_positive(): void
    {
        $p = $this->player('+989101234561');
        $open = $this->confirmedReport($p['player_id'], 'open');
        $payload = [
            'report_id' => $open, 'reason_code' => 'false_positive',
            'statement' => 'This result is from a supported original device.',
        ];
        $this->withToken($p['token'])
            ->postJson('/api/v1/arcade/player/fraud/appeals', $payload)->assertStatus(409);
        $this->assertDatabaseCount('arcade_cheat_appeals', 0);
    }

    public function test_appeal_is_removed_on_account_erasure_without_leaking_private_narrative(): void
    {
        $p = $this->player('+989101234562');
        $id = $this->confirmedReport($p['player_id']);
        $this->withToken($p['token'])->postJson('/api/v1/arcade/player/fraud/appeals', [
            'report_id' => $id, 'reason_code' => 'shared_device',
            'statement' => 'This is a shared family phone and cafe WiFi.',
        ])->assertCreated();
        $this->deleteJson('/api/v1/arcade/player')->assertOk();
        $this->assertDatabaseCount('arcade_cheat_appeals', 0);
        $this->assertDatabaseCount('arcade_cheat_reports', 0);
    }
}
