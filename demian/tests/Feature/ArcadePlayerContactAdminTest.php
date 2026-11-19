<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

final class ArcadePlayerContactAdminTest extends TestCase
{
    use RefreshDatabase;

    private function profile(array $overrides = []): array
    {
        return $overrides + [
            'display_name' => 'Contact Test',
            'contact_type' => 'phone',
            'contact_value' => '۰۹۱۲۱۲۳۴۵۶۷',
            'registration_key' => (string) Str::uuid(),
        ];
    }

    public function test_required_contact_normalizes_deduplicates_and_keeps_private_values_encrypted(): void
    {
        config()->set('demian-arcade.require_contact', true);
        $url = '/api/v1/arcade/players';
        $profile = $this->profile();
        $this->postJson($url, ['display_name' => 'Missing Contact'])->assertUnprocessable();
        $player = $this->postJson($url, $profile)->assertCreated()
            ->assertJsonPath('has_contact', true)->assertJsonMissingPath('contact_value')->json();
        $row = DB::table('arcade_players')->find($player['player_id']);
        $this->assertNotSame('+989121234567', $row->contact_value);
        $this->postJson($url, $this->profile(['contact_value' => '+98 (912) 1234567']))->assertConflict();
        $this->postJson($url, $this->profile(['contact_type' => 'instagram', 'contact_value' => '@cafe_example',
            'registration_key' => $profile['registration_key']]))->assertConflict();
        $this->assertDatabaseCount('arcade_players', 1);

        config()->set('demian-coupons.cafe_enabled', true);
        $this->get('/admin')->assertRedirect(route('cashier.login'));
        $detail = route('cashier.players.show', ['player' => $player['player_id']]);
        foreach (['cashier', 'admin', 'super_admin'] as $role) {
            $staff = DB::table('arcade_cashier_staff')->insertGetId([
                'username' => $role, 'display_name' => $role,
                'password_hash' => Hash::make('NotADeployedCredential!'),
                'branch_id' => 'main-cafe', 'role' => $role, 'session_version' => 1, 'is_active' => true,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $response = $this->withSession(['cafe_staff_id' => $staff, 'cafe_staff_version' => 1,
                'cafe_authenticated_at' => now()->timestamp])->get($detail);
            if ($role === 'cashier') $response->assertForbidden();
            if ($role === 'admin') $response->assertOk()->assertDontSee('+989121234567');
            if ($role === 'super_admin') $response->assertOk()->assertSee('+989121234567');
        }
    }

    public function test_legacy_player_can_add_one_contact_and_then_enter_ranked_play(): void
    {
        $player = $this->postJson('/api/v1/arcade/players', ['display_name' => 'Existing'])
            ->assertCreated()->json();
        config()->set('demian-arcade.require_contact', true);
        $this->withToken($player['token'])->postJson('/api/v1/arcade/turn-runs', [
            'request_id' => (string) Str::uuid(), 'game_id' => 'cafe-drift', 'rules_version' => 'cafe-drift-replay-v1',
        ])->assertStatus(428);
        $this->patchJson('/api/v1/arcade/player/contact', [
            'contact_type' => 'email', 'contact_value' => 'PlAyER@example.test',
        ])->assertOk()->assertJsonPath('has_contact', true);
        $this->patchJson('/api/v1/arcade/player/contact', [
            'contact_type' => 'email', 'contact_value' => 'other@example.test',
        ])->assertConflict();
        $this->postJson('/api/v1/arcade/turn-runs', [
            'request_id' => (string) Str::uuid(), 'game_id' => 'cafe-drift', 'rules_version' => 'cafe-drift-replay-v1',
        ])->assertCreated();
    }
}
