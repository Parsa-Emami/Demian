<?php

namespace Tests\Feature;

use App\Models\ArcadePlayer;
use App\Services\Arcade\ArcadeAntiCheat;
use App\Services\Arcade\ReferralService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

final class ReferralPhase15Test extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('demian-arcade.require_contact', false);
        config()->set('demian-referrals.enabled', true);
        config()->set('demian-arcade.otp.enabled', true);
        config()->set('demian-arcade.otp.gateway_url', 'https://sms.example.test/send');
        config()->set('demian-arcade.otp.gateway_key', str_repeat('s', 32));
    }

    private function player(string $name, array $extra = []): array
    {
        return $this->postJson('/api/v1/arcade/players', ['display_name' => $name, ...$extra])->assertCreated()->json();
    }

    private function verify(array $p, string $number): void
    {
        DB::table('arcade_players')->where('id', $p['player_id'])->update([
            'contact_type' => 'phone', 'contact_hash' => hash_hmac('sha256', 'arcade-contact|phone|'.$number, config('app.key')),
            'registration_key_hash' => hash('sha256', (string) Str::uuid()), 'phone_verified_at' => now()->utc(),
        ]);
    }

    public function test_private_code_and_attribution_and_disabled_gate(): void
    {
        $a = $this->player('Inviter');
        $this->postJson('/api/v1/arcade/player/referrals/code')->assertUnauthorized();
        $this->withToken($a['token'])->postJson('/api/v1/arcade/player/referrals/code')->assertForbidden();
        $this->verify($a, '+989121234567');
        $code = $this->postJson('/api/v1/arcade/player/referrals/code')->assertOk()->json('code');
        $this->assertMatchesRegularExpression('/^[A-F0-9]{16}$/D', $code);
        $this->postJson('/api/v1/arcade/player/referrals/code')->assertOk()->assertJsonPath('code', $code);
        $b = $this->player('Invitee', ['referral_code' => $code]);
        $this->assertDatabaseHas('arcade_referrals', ['player_id' => $b['player_id'], 'inviter_id' => $a['player_id'], 'status' => 'pending']);
        $this->withToken($b['token'])->getJson('/api/v1/arcade/player/referrals')->assertOk()
            ->assertJsonPath('code', null)->assertJsonPath('attribution.status', 'pending')->assertJsonMissingPath('attribution.inviter_id');
        $this->withToken($a['token'])->getJson('/api/v1/arcade/player/referrals')->assertOk()
            ->assertJsonPath('invited', 1)->assertJsonPath('qualified', 0)->assertJsonPath('financial_rewards', false);
        $this->postJson('/api/v1/arcade/players', ['display_name' => 'Invalid', 'referral_code' => '0000000000000000'])->assertUnprocessable();
        $this->assertDatabaseCount('arcade_players', 2);
        config()->set('demian-referrals.enabled', false);
        $this->postJson('/api/v1/arcade/player/referrals/code')->assertServiceUnavailable();
    }

    public function test_shared_registration_network_requires_review_and_grants_no_reward(): void
    {
        $a = $this->player('Inviter');
        $this->verify($a, '+989121234567');
        $code = $this->withToken($a['token'])->postJson('/api/v1/arcade/player/referrals/code')->assertOk()->json('code');
        $b = $this->player('Invitee', ['referral_code' => $code]);
        $this->verify($b, '+989121234568');
        config()->set('demian-arcade.anticheat.enabled', true);
        foreach ([$a, $b] as $p) {
            app(ArcadeAntiCheat::class)->phoneRegistration(ArcadePlayer::query()->findOrFail($p['player_id']), '192.0.2.20');
        }
        $this->travel(3)->days();
        $id = (int) DB::table('arcade_referrals')->value('id');
        $service = app(ReferralService::class);
        $service->evaluate($id);
        $service->evaluate($id);
        $this->assertDatabaseHas('arcade_referrals', ['id' => $id, 'status' => 'review', 'points' => 0]);
        $this->assertDatabaseCount('arcade_referral_awards', 0);
    }

    public function test_qualified_referral_points_are_exact_once_without_coupons(): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-20 10:00:00', 'UTC'));
        $a = $this->player('Real Inviter');
        $this->verify($a, '+989121234567');
        $code = $this->withToken($a['token'])->postJson('/api/v1/arcade/player/referrals/code')->assertOk()->json('code');
        $b = $this->player('Real Invitee', ['referral_code' => $code]);
        $this->verify($b, '+989121234568');
        $week = 'weekly:tehran:2026-11-21';
        DB::table('arcade_weekly_periods')->insert(['period_key' => $week, 'starts_at' => '2026-11-20 20:30:00',
            'ends_at' => '2026-11-27 20:30:00', 'status' => 'sealed', 'lifecycle_status' => 'finalized',
            'sealed_at' => '2026-11-28 00:00:00', 'created_at' => now(), 'updated_at' => now()]);
        foreach (['2026-11-21', '2026-11-22'] as $day) {
            $run = (string) Str::uuid();
            DB::table('arcade_runs')->insert(['id' => $run, 'player_id' => $b['player_id'],
                'request_id' => (string) Str::uuid(), 'game_id' => 'dino-run',
                'rules_version' => 'fixture-v1', 'character_slug' => 'darya', 'seed' => 1, 'track_width' => 320,
                'status' => 'verified', 'score' => 100, 'replay_hash' => hash('sha256', $run),
                'started_at' => $day.' 10:00:00', 'completed_at' => $day.' 10:01:00',
                'expires_at' => $day.' 10:05:00', 'created_at' => $day.' 10:00:00', 'updated_at' => $day.' 10:01:00']);
        }
        DB::table('arcade_personal_progress')->insert(['period_key' => $week, 'player_id' => $b['player_id'],
            'run_id' => $run, 'game_id' => 'dino-run', 'rules_version' => 'fixture-v1', 'policy_version' => 'fixture',
            'score' => 100, 'previous_weeks' => 0, 'personal_record' => true, 'status' => 'verified',
            'source_sha256' => str_repeat('b', 64), 'achieved_at' => '2026-11-22 10:01:00', 'created_at' => '2026-11-28 00:00:00']);
        $this->travelTo(CarbonImmutable::parse('2026-11-28 10:00:00', 'UTC'));
        $id = (int) DB::table('arcade_referrals')->value('id');
        $service = app(ReferralService::class);
        $service->evaluate($id);
        $service->evaluate($id);
        $this->assertDatabaseHas('arcade_referrals', ['id' => $id, 'status' => 'qualified', 'points' => 10]);
        $this->assertDatabaseCount('arcade_referral_awards', 1);
        $this->assertDatabaseCount('arcade_coupons', 0);
        $this->assertSame(10, $service->profile($a['player_id'])['points']);
        $this->assertSame(1,$service->report()['monthly_awards']);
    }
}
