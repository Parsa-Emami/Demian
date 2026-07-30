<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EventFrameworkApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_active_event_definition_is_exposed(): void
    {
        $this->getJson('/api/v1/events/active')
            ->assertOk()
            ->assertJsonPath('data.id', 'cafe-rush')
            ->assertJsonPath('data.schemaVersion', 1);
    }

    public function test_event_session_reward_claim_is_server_validated_and_idempotent(): void
    {
        $started = $this->postJson('/api/v1/events/cafe-rush/sessions', [
            'source' => 'feature-test',
            'client_version' => 'phase-6',
        ])->assertCreated();

        $sessionId = $started->json('data.id');
        $token = $started->json('data.token');
        $this->travel(46)->seconds();
        $payload = [
            'score' => 1200,
            'elapsed_ms' => 45000,
            'evidence' => [
                'collected_item_ids' => ['cup-01', 'cup-02', 'cup-03', 'cup-04', 'cup-05', 'cup-06', 'cup-07', 'cup-08'],
                'reached_zone_ids' => ['delivery-counter'],
                'defeated_enemy_ids' => [],
            ],
        ];

        $first = $this->withHeader('X-Event-Token', $token)
            ->postJson("/api/v1/event-sessions/{$sessionId}/complete", $payload)
            ->assertOk()
            ->assertJsonPath('data.successful', true)
            ->assertJsonPath('data.integrity_level', 'client-evidence');

        $second = $this->withHeader('X-Event-Token', $token)
            ->postJson("/api/v1/event-sessions/{$sessionId}/complete", $payload)
            ->assertOk();

        $this->assertSame($first->json('data.id'), $second->json('data.id'));
        $this->assertDatabaseCount('event_reward_claims', 1);
    }
}
