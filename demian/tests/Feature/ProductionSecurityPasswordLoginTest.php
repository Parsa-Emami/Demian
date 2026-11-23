<?php

namespace Tests\Feature;

use App\Models\ArcadePlayer;
use App\Services\Arcade\ArcadePrizeIdentity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

final class ProductionSecurityPasswordLoginTest extends TestCase
{
    use RefreshDatabase;

    private function registerPlayer(bool $withPassword = true): array
    {
        $request = [
            'display_name' => 'Secure Player',
            'contact_type' => 'phone',
            'contact_value' => '09101234567',
            'registration_key' => (string) Str::uuid(),
        ];
        if ($withPassword) {
            $request['password'] = 'SecurePassword123!';
        }

        return $this->postJson('/api/v1/arcade/players', $request)
            ->assertCreated()
            ->assertHeader('Content-Type', 'application/json')
            ->json();
    }

    public function test_login_without_sms_rotates_token_and_preserves_identity_and_records(): void
    {
        $registered = $this->registerPlayer();
        $login = $this->postJson('/api/v1/arcade/players/login', [
            'contact_type' => 'phone',
            'contact_value' => '+989101234567',
            'password' => 'SecurePassword123!',
        ])->assertOk()->assertHeader('Cache-Control', 'no-store, private')
            ->assertJsonMissingPath('password_hash')
            ->assertJsonPath('player_id', $registered['player_id'])->json();
        $this->assertNotSame($registered['token'], $login['token']);
        $this->withToken($registered['token'])
            ->getJson('/api/v1/arcade/player')->assertUnauthorized();
        $this->withToken($login['token'])
            ->getJson('/api/v1/arcade/player')->assertOk()
            ->assertJsonPath('player_id', $registered['player_id']);
        $this->assertFalse(app(ArcadePrizeIdentity::class)
            ->status(ArcadePlayer::findOrFail($registered['player_id']))['prize_identity_eligible']);
    }

    public function test_invalid_password_and_unknown_contact_fail_without_issuing_token(): void
    {
        $this->registerPlayer();
        $attempt = [
            'contact_type' => 'phone', 'contact_value' => '09101234567',
            'password' => 'WrongPassword123!',
        ];
        $this->postJson('/api/v1/arcade/players/login', $attempt)
            ->assertUnauthorized()->assertJsonMissingPath('token');
        $this->postJson('/api/v1/arcade/players/login',
            [...$attempt, 'contact_value' => '09109999999'])
            ->assertUnauthorized()->assertJsonMissingPath('token');
        $this->postJson('/api/v1/arcade/players/login',
            [...$attempt, 'password' => ''])
            ->assertUnprocessable();
    }

    public function test_existing_player_can_add_password_without_otp_using_active_bearer(): void
    {
        $registered = $this->registerPlayer(false);
        $payload = [
            'password' => 'NewSecurePassword123!',
            'password_confirmation' => 'NewSecurePassword123!',
        ];
        $this->postJson('/api/v1/arcade/player/password', $payload)->assertUnauthorized();
        $this->withToken($registered['token'])
            ->postJson('/api/v1/arcade/player/password', $payload)
            ->assertOk()->assertJsonPath('status', 'password_updated');
        $this->assertTrue(Hash::check($payload['password'],
            ArcadePlayer::findOrFail($registered['player_id'])->password_hash));
        $this->postJson('/api/v1/arcade/player/password',
            [...$payload, 'password' => 'AnotherSecurePassword123!',
                'password_confirmation' => 'AnotherSecurePassword123!'])
            ->assertForbidden();
        $this->postJson('/api/v1/arcade/player/password',
            [...$payload, 'current_password' => 'NewSecurePassword123!'])
            ->assertOk();
        $login = $this->postJson('/api/v1/arcade/players/login', [
            'contact_type' => 'phone', 'contact_value' => '09101234567',
            'password' => $payload['password'],
        ])->assertOk()->json();
        $this->assertSame($registered['player_id'], $login['player_id']);
    }

    public function test_password_is_not_exposed_in_player_response(): void
    {
        $registered = $this->registerPlayer();
        $this->assertNotNull(ArcadePlayer::findOrFail($registered['player_id'])->password_hash);
        $this->withToken($registered['token'])->getJson('/api/v1/arcade/player')
            ->assertOk()->assertJsonMissingPath('password_hash');
    }

    private function staff(string $role, bool $active = true): int
    {
        return DB::table('arcade_cashier_staff')->insertGetId([
            'username' => 'staff'.Str::lower(Str::random(11)),
            'display_name' => 'Studio Operator',
            'password_hash' => Hash::make('StaffSecurePassword123!'),
            'branch_id' => 'cafe-main',
            'role' => $role,
            'is_active' => $active,
            'session_version' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function asStaff(int $id): static
    {
        return $this->withSession([
            'cafe_staff_id' => $id,
            'cafe_staff_version' => 1,
            'cafe_authenticated_at' => now()->timestamp,
        ]);
    }

    public function test_character_studio_and_mutations_require_super_admin_staff_session(): void
    {
        config()->set('demian-coupons.cafe_enabled', true);
        $this->get('/')->assertRedirect(route('cashier.login'));
        $this->get('/characters')->assertRedirect(route('cashier.login'));
        $this->post('/characters', [])->assertRedirect(route('cashier.login'));
        $admin = $this->staff('admin');
        $this->asStaff($admin)->get('/')->assertForbidden();
        $this->asStaff($admin)->get('/characters')->assertForbidden();
        $this->asStaff($admin)->post('/characters', [])->assertForbidden();
        $this->asStaff($admin)->post('/characters/1/activate')->assertForbidden();
        $super = $this->staff('super_admin');
        $this->asStaff($super)->get('/')->assertOk()
            ->assertHeader('Cache-Control', 'private, no-store, max-age=0')
            ->assertSee('Character manager');
        $this->asStaff($super)->getJson('/characters')->assertOk();
        $this->asStaff($super)->postJson('/characters', [])->assertUnprocessable();
        DB::table('arcade_cashier_staff')->where('id', $super)->update(['is_active' => false]);
        $this->asStaff($super)->get('/characters')->assertRedirect(route('cashier.login'));
    }

    public function test_character_studio_disabled_when_staff_portal_is_off(): void
    {
        config()->set('demian-coupons.cafe_enabled', false);
        $this->get('/')->assertStatus(503);
        $this->post('/characters', [])->assertStatus(503);
    }
}
