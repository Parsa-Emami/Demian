<?php

namespace Tests\Feature;

use App\Services\Arcade\PhoneIdentityService;
use App\Services\Arcade\ArcadeAntiCheat;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

final class VerifiedPhoneIdentityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('demian-arcade.require_contact', false);
        config()->set('demian-identity.enabled', true);
        config()->set('demian-identity.required', true);
        config()->set('demian-identity.key', str_repeat('i', 64));
        config()->set('demian-identity.gateway_url', 'https://sms.example.test/send');
        config()->set('demian-identity.gateway_token', str_repeat('s', 32));
        Http::preventStrayRequests();
        Http::fake(['https://sms.example.test/send' => Http::response(['accepted' => true])]);
    }

    private function player(string $name): array
    {
        return $this->postJson('/api/v1/arcade/players', ['display_name' => $name])->assertCreated()->json();
    }

    private function send(array $p, string $number): array
    {
        $challenge = $this->withToken($p['token'])->postJson('/api/v1/arcade/player/identity/phone',
            ['phone' => $number, 'consent' => true])->assertAccepted()->assertJsonMissingPath('code')->json();
        $last = Http::recorded()->last()[0];
        $this->assertSame($challenge['challenge_id'], $last['request_id']);
        return ['challenge_id' => $challenge['challenge_id'], 'otp' => $last['code']];
    }

    private function confirm(array $p, array $challenge): \Illuminate\Testing\TestResponse
    {
        return $this->withToken($p['token'])->postJson('/api/v1/arcade/player/identity/confirm', $challenge);
    }

    public function test_phone_ownership_and_sql_uniqueness_survive_browser_change(): void
    {
        $a = $this->player('First Test');
        $b = $this->player('Second Test');
        $otp = $this->send($a, '۰۹۱۲۱۲۳۴۵۶۷');
        $this->assertSame('+989121234567', Http::recorded()->last()[0]['to']);
        $this->confirm($b, $otp)->assertUnprocessable();
        $this->confirm($a, $otp)->assertOk()->assertJsonPath('verified', true);
        $identity = DB::table('arcade_verified_phones')->first();
        $this->assertNotSame('+989121234567', $identity->phone_ciphertext);
        $this->assertNotSame($otp['otp'], DB::table('arcade_phone_challenges')->first()->code_hash);
        $this->travel(61)->seconds();
        $this->confirm($b, $this->send($b, '+98 (912) 1234567'))->assertConflict();
        $this->assertDatabaseCount('arcade_verified_phones', 1);
        $this->assertDatabaseHas('arcade_cheat_reports', ['player_id' => $b['player_id'], 'signal' => 'duplicate_verified_phone']);
        $this->assertDatabaseCount('arcade_anticheat_holds', 0);
        $this->withToken($a['token'])->getJson('/api/v1/arcade/player/identity')->assertOk()
            ->assertHeader('Cache-Control', 'private, no-store')->assertJsonPath('verified', true)
            ->assertJsonMissingPath('phone_hash')->assertJsonMissingPath('phone_ciphertext');
    }

    public function test_wrong_codes_consume_attempts_and_expired_codes_fail(): void
    {
        $p = $this->player('Attempts Test');
        $otp = $this->send($p, '+989121234568');
        $wrong = $otp['otp'] === '000000' ? '111111' : '000000';
        for ($i = 0; $i < 5; $i++) $this->confirm($p, [...$otp, 'otp' => $wrong])->assertUnprocessable();
        $this->confirm($p, $otp)->assertUnprocessable();
        $this->assertSame(5, (int) DB::table('arcade_phone_challenges')->where('id', $otp['challenge_id'])->value('attempts'));
        $this->travel(6)->minutes();
        $fresh = $this->send($p, '+989121234568');
        $this->travel(6)->minutes();
        $this->confirm($p, $fresh)->assertUnprocessable();
        $this->assertDatabaseCount('arcade_verified_phones', 0);
    }

    public function test_recovery_requires_both_capabilities_and_rotates_once(): void
    {
        $p = $this->player('Recovery Test');
        $this->confirm($p, $this->send($p, '+989121234569'))->assertOk();
        $link = $this->withToken($p['token'])->postJson('/api/v1/arcade/player/recovery-link')->assertOk()->json('recovery_code');
        $payload = ['recovery_code' => $link];
        $this->postJson('/api/v1/arcade/players/recover', $payload)->assertStatus(428);
        $this->travel(61)->seconds();
        $challenge = $this->postJson('/api/v1/arcade/players/recover/phone', $payload)->assertAccepted()->json('challenge_id');
        $otp = Http::recorded()->last()[0]['code'];
        $response = $this->postJson('/api/v1/arcade/players/recover', [...$payload, 'challenge_id' => $challenge, 'otp' => $otp])
            ->assertOk()->assertJsonPath('player_id', $p['player_id'])->json();
        $this->withToken($p['token'])->getJson('/api/v1/arcade/player')->assertUnauthorized();
        $this->withToken($response['token'])->getJson('/api/v1/arcade/player')->assertOk()->assertJsonPath('phone_verified', true);
        $this->postJson('/api/v1/arcade/players/recover', [...$payload, 'challenge_id' => $challenge, 'otp' => $otp])->assertUnprocessable();
    }

    public function test_failed_gateway_rate_limits_and_privacy_erasure(): void
    {
        $p = $this->player('Deletion Test');
        $this->confirm($p, [...$this->send($p, '+989121234570'), 'device_id' => (string) Str::uuid()])->assertOk();
        $this->assertDatabaseCount('arcade_identity_devices', 1);
        $this->withToken($p['token'])->getJson('/api/v1/arcade/player/data')->assertOk()
            ->assertJsonPath('player.verified_phone', '+989121234570')->assertJsonMissingPath('player.phone_hash');
        $this->deleteJson('/api/v1/arcade/player')->assertOk();
        $this->assertDatabaseCount('arcade_verified_phones', 0);
        $this->assertDatabaseCount('arcade_phone_challenges', 0);
        $this->assertDatabaseCount('arcade_identity_devices', 0);
        $other = $this->player('Failed Delivery');
        config()->set('demian-identity.gateway_url', 'https://sms-failure.example.test/send');
        Http::fake(['https://sms-failure.example.test/send' => Http::response(['accepted' => false], 503)]);
        $data = ['phone' => '+989121234571', 'consent' => true];
        $this->withToken($other['token'])->postJson('/api/v1/arcade/player/identity/phone', $data)->assertServiceUnavailable();
        $this->postJson('/api/v1/arcade/player/identity/phone', $data)->assertStatus(429);
        $this->assertNull(DB::table('arcade_phone_challenges')->where('player_id', $other['player_id'])->value('sent_at'));
    }

    public function test_shared_installation_creates_review_only_and_never_blocks_other_accounts(): void
    {
        $device = (string) Str::uuid();
        for ($i = 1; $i <= 3; $i++) {
            $p = $this->player('Shared Device '.$i);
            $proof = $this->send($p, '+98912123458'.$i);
            $this->confirm($p, [...$proof, 'device_id' => $device])->assertOk();
        }
        $this->assertDatabaseCount('arcade_verified_phones', 3);
        $this->assertDatabaseCount('arcade_identity_devices', 3);
        $this->assertDatabaseCount('arcade_anticheat_holds', 0);
        $report = DB::table('arcade_cheat_reports')->where('signal', 'shared_installation')->first();
        $this->assertNotNull($report);
        $this->assertStringNotContainsString($device, $report->evidence);
        app(ArcadeAntiCheat::class)->assertStartAllowed($p['player_id']);
        $this->travel(31)->days();
        app(PhoneIdentityService::class)->prune();
        $this->assertDatabaseCount('arcade_identity_devices', 0);
        $this->assertDatabaseCount('arcade_phone_challenges', 0);
        $this->assertDatabaseCount('arcade_phone_limits', 0);
        $this->assertDatabaseCount('arcade_verified_phones', 3);
    }

    public function test_disabled_service_never_sends_sms(): void
    {
        config()->set('demian-identity.enabled', false);
        $p = $this->player('Disabled SMS');
        $this->withToken($p['token'])->postJson('/api/v1/arcade/player/identity/phone',
            ['phone' => '+989121234572', 'consent' => true])->assertServiceUnavailable();
        Http::assertNothingSent();
    }
}
