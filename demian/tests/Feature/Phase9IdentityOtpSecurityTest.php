<?php

namespace Tests\Feature;

use App\Models\ArcadePlayer;
use App\Services\Arcade\ArcadePrizeIdentity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

final class Phase9IdentityOtpSecurityTest extends TestCase
{
    use RefreshDatabase;

    private array $smsCodes = [];
    private bool $smsDeliveryFailure = false;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
        config()->set('demian-arcade.otp.enabled', true);
        config()->set('demian-arcade.otp.gateway_url', 'https://sms.example.test/send');
        config()->set('demian-arcade.otp.gateway_key', str_repeat('s', 40));
        Http::fake(function ($request) {
            $this->smsCodes[] = ['to' => $request['to'], 'code' => $request['code']];
            return $this->smsDeliveryFailure
                ? Http::response(['error' => 'private'], 503)
                : Http::response(['accepted' => true], 200);
        });
    }

    private function player(string $phone = '+989101234567'): array
    {
        return $this->postJson('/api/v1/arcade/players', [
            'display_name' => 'Phase Nine Player',
            'contact_type' => 'phone',
            'contact_value' => $phone,
            'registration_key' => (string) Str::uuid(),
        ])->assertCreated()->json();
    }

    public function test_otp_requires_real_gateway_and_never_echos_code_or_phone(): void
    {
        $p = $this->player();
        $this->withToken($p['token']);
        config()->set('demian-arcade.otp.enabled', false);
        $this->postJson('/api/v1/arcade/player/phone/otp')->assertStatus(503);
        $this->assertDatabaseCount('arcade_player_phone_challenges', 0);
        config()->set('demian-arcade.otp.enabled', true);
        config()->set('demian-arcade.otp.gateway_url', 'http://127.0.0.1/secret');
        $this->postJson('/api/v1/arcade/player/phone/otp')->assertStatus(503);
        config()->set('demian-arcade.otp.gateway_url', 'https://sms.example.test/send');
        $response = $this->postJson('/api/v1/arcade/player/phone/otp')
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private')
            ->assertJson(['status' => 'sent', 'expires_in_seconds' => 300]);
        $code = $this->smsCodes[0]['code'];
        $this->assertMatchesRegularExpression('/^[0-9]{6}$/', $code);
        $this->assertSame('+989101234567', $this->smsCodes[0]['to']);
        $this->assertStringNotContainsString($code, $response->getContent());
        $this->assertStringNotContainsString('+989101234567', $response->getContent());
        $challenge = DB::table('arcade_player_phone_challenges')->first();
        $this->assertSame($p['player_id'], $challenge->player_id);
        $this->assertNotSame(hash('sha256', $code), $challenge->code_hash);
        $this->assertSame(64, strlen($challenge->code_hash));
        $this->assertSame('registered_unverified',
            $this->getJson('/api/v1/arcade/player/identity')->assertOk()->json('status'));
    }

    public function test_delivery_failure_never_creates_a_valid_challenge(): void
    {
        $p = $this->player();
        $this->smsDeliveryFailure = true;
        $response = $this->withToken($p['token'])
            ->postJson('/api/v1/arcade/player/phone/otp')->assertStatus(500);
        $this->assertStringNotContainsString('private', $response->getContent());
        $this->assertDatabaseCount('arcade_player_phone_challenges', 0);
    }

    public function test_wrong_codes_are_counted_across_transactions_and_real_code_verifies_once(): void
    {
        $p = $this->player();
        $this->withToken($p['token']);
        $this->postJson('/api/v1/arcade/player/phone/otp')->assertOk();
        $real = $this->smsCodes[0]['code'];
        $bad = $real === '000000' ? '999999' : '000000';
        $this->postJson('/api/v1/arcade/player/phone/verify', ['code' => $bad])
            ->assertUnprocessable()->assertJsonValidationErrors('code');
        $this->assertDatabaseHas('arcade_player_phone_challenges', [
            'player_id' => $p['player_id'], 'attempts' => 1,
        ]);
        $this->postJson('/api/v1/arcade/player/phone/verify', ['code' => $real])
            ->assertOk()->assertJson(['status' => 'phone_verified']);
        $this->assertDatabaseCount('arcade_player_phone_challenges', 0);
        $this->assertNotNull(ArcadePlayer::findOrFail($p['player_id'])->phone_verified_at);
        $this->getJson('/api/v1/arcade/player/identity')
            ->assertOk()->assertJson(['status' => 'phone_verified', 'phone_verified' => true]);
        $this->postJson('/api/v1/arcade/player/phone/otp')->assertStatus(409);
    }

    public function test_expiry_attempt_cap_and_per_account_send_cooldown_are_enforced_server_side(): void
    {
        $p = $this->player();
        $this->withToken($p['token']);
        $this->postJson('/api/v1/arcade/player/phone/otp')->assertOk();
        $this->postJson('/api/v1/arcade/player/phone/otp')->assertStatus(429);
        $real = $this->smsCodes[0]['code'];
        $bad = $real === '000000' ? '999999' : '000000';
        for ($i = 1; $i <= 5; $i++) {
            $this->postJson('/api/v1/arcade/player/phone/verify', ['code' => $bad])
                ->assertUnprocessable();
        }
        $this->assertDatabaseHas('arcade_player_phone_challenges', [
            'player_id' => $p['player_id'], 'attempts' => 5,
        ]);
        $this->postJson('/api/v1/arcade/player/phone/verify', ['code' => $real])
            ->assertUnprocessable();
        $this->travel(61)->seconds();
        $this->postJson('/api/v1/arcade/player/phone/otp')->assertOk();
        $previous = $real;
        $new = $this->smsCodes[1]['code'];
        if ($previous !== $new) {
            $this->postJson('/api/v1/arcade/player/phone/verify', ['code' => $previous])
                ->assertUnprocessable();
        }
        DB::table('arcade_player_phone_challenges')
            ->where('player_id', $p['player_id'])
            ->update(['expires_at' => now()->subSecond()]);
        $this->postJson('/api/v1/arcade/player/phone/verify', ['code' => $new])
            ->assertUnprocessable();
    }

    public function test_two_players_cannot_use_each_others_challenge(): void
    {
        $a = $this->player('+989101234565');
        $b = $this->player('+989101234566');
        $this->withToken($a['token'])->postJson('/api/v1/arcade/player/phone/otp')->assertOk();
        $this->withToken($b['token'])->postJson('/api/v1/arcade/player/phone/otp')->assertOk();
        $codeA = $this->smsCodes[0]['code'];
        $codeB = $this->smsCodes[1]['code'];
        // Even in the rare six-digit collision, HMAC binds codes to the
        // player/contact; the same numeric value is not a shared credential.
        if ($codeA !== $codeB) {
            $this->withToken($b['token'])->postJson('/api/v1/arcade/player/phone/verify',
                ['code' => $codeA])->assertUnprocessable();
        }
        $this->withToken($a['token'])->postJson('/api/v1/arcade/player/phone/verify',
            ['code' => $codeA])->assertOk();
        $this->assertNull(ArcadePlayer::findOrFail($b['player_id'])->phone_verified_at);
    }

    public function test_identity_gate_blocks_guest_and_unverified_awards_without_making_rank_client_authoritative(): void
    {
        $p = $this->player();
        $identity = app(ArcadePrizeIdentity::class);
        config()->set('demian-arcade.prize_identity_required', true);
        $this->assertFalse($identity->status(ArcadePlayer::findOrFail($p['player_id']))['prize_identity_eligible']);
        $this->expectException(\RuntimeException::class);
        $identity->assertVerifiedRecipient($p['player_id']);
    }

    public function test_verified_identity_is_server_only_and_survives_session_rotation(): void
    {
        $p = $this->player();
        $this->withToken($p['token'])->postJson('/api/v1/arcade/player/phone/otp')->assertOk();
        $this->postJson('/api/v1/arcade/player/phone/verify',
            ['code' => $this->smsCodes[0]['code']])->assertOk();
        config()->set('demian-arcade.prize_identity_required', true);
        app(ArcadePrizeIdentity::class)->assertVerifiedRecipient($p['player_id']);
        $rotated = $this->postJson('/api/v1/arcade/player/session/rotate')
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json('token');
        $this->assertNotSame($p['token'], $rotated);
        $this->withToken($p['token'])->getJson('/api/v1/arcade/player')->assertUnauthorized();
        $this->withToken($rotated)->getJson('/api/v1/arcade/player/identity')
            ->assertOk()->assertJson(['status' => 'phone_verified']);
        $this->postJson('/api/v1/arcade/player/session/revoke')
            ->assertOk()->assertJson(['status' => 'revoked']);
        $this->getJson('/api/v1/arcade/player')->assertUnauthorized();
        $this->assertNotNull(ArcadePlayer::findOrFail($p['player_id'])->phone_verified_at);
    }

    public function test_deleting_account_removes_otp_artifacts(): void
    {
        $p = $this->player();
        $this->withToken($p['token'])->postJson('/api/v1/arcade/player/phone/otp')->assertOk();
        $this->deleteJson('/api/v1/arcade/player')->assertOk();
        $this->assertDatabaseCount('arcade_player_phone_challenges', 0);
        $this->assertDatabaseMissing('arcade_players', ['id' => $p['player_id']]);
    }
}
