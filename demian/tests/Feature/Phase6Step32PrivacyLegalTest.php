<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

final class Phase6Step32PrivacyLegalTest extends TestCase
{
    use RefreshDatabase;

    public function test_public_policy_reports_draft_not_an_unearned_legal_approval(): void
    {
        config()->set('demian-legal.publication_approved', false);
        $this->getJson('/api/v1/arcade/legal')->assertOk()
            ->assertJsonPath('version', '2026-11-16-v1')
            ->assertJsonPath('status', 'draft-pending-legal-review')
            ->assertJsonPath('pages.privacy', 'https://demiancafe.ir/privacy/');
    }

    public function test_registration_requires_both_explicit_current_policy_acknowledgements(): void
    {
        config()->set('demian-legal.require_acceptance', true);
        $url = '/api/v1/arcade/players';
        $this->postJson($url, ['display_name' => 'No Consent'])->assertUnprocessable();
        $this->postJson($url, ['display_name' => 'Stale', 'policy_version' => 'old',
            'accept_terms' => true, 'privacy_acknowledged' => true])->assertUnprocessable();
        $this->postJson($url, ['display_name' => 'Refused', 'policy_version' => '2026-11-16-v1',
            'accept_terms' => false, 'privacy_acknowledged' => true])->assertUnprocessable();
        $this->assertDatabaseCount('arcade_players', 0);
        $player = $this->postJson($url, ['display_name' => 'Agreed', 'policy_version' => '2026-11-16-v1',
            'accept_terms' => true, 'privacy_acknowledged' => true])
            ->assertCreated()->assertHeader('Cache-Control', 'no-store, private')->json();
        $this->assertDatabaseHas('arcade_players', [
            'id' => $player['player_id'], 'legal_policy_version' => '2026-11-16-v1']);
        $this->assertNotNull(DB::table('arcade_players')->where('id', $player['player_id'])
            ->value('legal_accepted_at'));
    }

    public function test_legacy_players_keep_null_consent_and_private_data_stays_private(): void
    {
        $one = $this->postJson('/api/v1/arcade/players', ['display_name' => 'Owner'])->assertCreated()->json();
        $other = $this->postJson('/api/v1/arcade/players', ['display_name' => 'Other'])->assertCreated()->json();
        $this->getJson('/api/v1/arcade/player/data')->assertUnauthorized();
        $this->withToken($one['token'])->getJson('/api/v1/arcade/player/data')
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonPath('player.player_id', $one['player_id'])
            ->assertJsonPath('player.legal_policy_version', null)
            ->assertJsonMissingPath('player.token_hash');
        $this->getJson('/api/v1/arcade/player/data/records?type=runs')
            ->assertOk()->assertJsonCount(0, 'data')->assertJsonPath('next_cursor', null);
        $this->getJson('/api/v1/arcade/player/data/records?type=invalid')->assertUnprocessable();
        $this->withToken($other['token'])->getJson('/api/v1/arcade/player/data')
            ->assertOk()->assertJsonPath('player.player_id', $other['player_id']);
    }

    public function test_cursor_pagination_excludes_other_accounts_and_sensitive_fields(): void
    {
        $one = $this->postJson('/api/v1/arcade/players', ['display_name' => 'One'])->assertCreated()->json();
        $other = $this->postJson('/api/v1/arcade/players', ['display_name' => 'Other'])->assertCreated()->json();
        foreach ([$one, $one, $one, $other] as $i => $player) {
            DB::table('arcade_runs')->insert([
                'id' => sprintf('00000000-0000-4000-8000-%012d', $i + 1),
                'player_id' => $player['player_id'],
                'request_id' => sprintf('00000000-0000-4000-8000-%012d', $i + 101),
                'game_id' => 'dino-run', 'rules_version' => 'test-v1',
                'character_slug' => 'darya', 'seed' => 1, 'track_width' => 420,
                'status' => 'started', 'score' => 0, 'ticks' => 0, 'passed' => 0,
                'started_at' => now(), 'expires_at' => now()->addMinute(),
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        $url = '/api/v1/arcade/player/data/records?type=runs&limit=2';
        $page1 = $this->withToken($one['token'])->getJson($url)
            ->assertOk()->assertJsonCount(2, 'data')->json();
        $this->assertNotEmpty($page1['next_cursor']);
        $page2 = $this->getJson($url.'&cursor='.urlencode($page1['next_cursor']))
            ->assertOk()->assertJsonCount(1, 'data')->json();
        $this->assertNull($page2['next_cursor']);
        foreach (array_merge($page1['data'], $page2['data']) as $row) {
            $this->assertNotEquals('00000000-0000-4000-8000-000000000004', $row['id']);
            $this->assertArrayNotHasKey('replay_hash', $row);
            $this->assertArrayNotHasKey('token_hash', $row);
        }
    }
}
