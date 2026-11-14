<?php

namespace Tests\Feature;

use App\Services\Arcade\CompetitionClock;
use App\Services\Arcade\CouponIssuanceService;
use App\Services\Arcade\WeeklySettlementService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

final class CouponIssuanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-14T02:00:00Z'));
        config()->set('demian-coupons.policy_approved', true);
        config()->set('demian-coupons.issue_enabled', true);
        config()->set('demian-coupons.shop_enabled', true);
        config()->set('demian-coupons.policy_version', 'demo-approved-v1');
        config()->set('demian-coupons.currency', 'IRR');
        config()->set('demian-coupons.min_order_minor', '1000');
        config()->set('demian-coupons.max_discount_minor', '5000');
        config()->set('demian-coupons.valid_days', '30');
        config()->set('demian-coupons.shop_signing_secret', str_repeat('S', 48));
        config()->set('demian-coupons.order_hash_key', str_repeat('H', 48));
    }

    /** Real Phase 7b sealing; no synthetic or client-claimed awards. */
    protected function sealed(int $count = 2): array
    {
        $players = [];
        for ($i = 1; $i <= $count; $i++) {
            $player = $this->postJson('/api/v1/arcade/players', [
                'display_name' => 'Customer '.$i,
            ])->assertCreated()->json();
            $players[] = $player;
            $id = (string) Str::uuid();
            $started = '2026-11-10 10:00:00';
            DB::table('arcade_runs')->insert([
                'id' => $id, 'player_id' => $player['player_id'],
                'request_id' => (string) Str::uuid(), 'game_id' => 'dino-run',
                'rules_version' => 'cafe-runner-v2', 'character_slug' => 'darya',
                'seed' => 123, 'track_width' => 420, 'status' => 'verified',
                'score' => 1000 - $i * 10, 'ticks' => 120, 'passed' => 1,
                'replay_hash' => hash('sha256', $id),
                'started_at' => $started, 'expires_at' => '2026-11-10 11:00:00',
                'completed_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('arcade_leaderboard_entries')->insert([
                'game_id' => 'dino-run', 'rules_version' => 'cafe-runner-v2',
                'period_key' => CompetitionClock::periodKeys(CarbonImmutable::parse($started, 'UTC'))[2],
                'player_id' => $player['player_id'], 'run_id' => $id,
                'score' => 1000 - $i * 10, 'achieved_at' => $started,
            ]);
        }
        app(WeeklySettlementService::class)->seal('2026-11-07');
        return $players;
    }

    protected function issue(): array
    {
        return app(CouponIssuanceService::class)->issueWeek('weekly:tehran:2026-11-07');
    }

    public function test_disabled_or_incomplete_policy_cannot_mint_codes(): void
    {
        $this->sealed(1);
        config()->set('demian-coupons.issue_enabled', false);
        try {
            $this->issue();
            $this->fail('Disabled issuance succeeded.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('disabled', $e->getMessage());
        }
        config()->set('demian-coupons.issue_enabled', true);
        config()->set('demian-coupons.policy_approved', false);
        $this->expectException(RuntimeException::class);
        $this->issue();
    }

    public function test_unset_caps_or_currency_or_expiry_rejects_issuance(): void
    {
        $this->sealed(1);
        foreach (['currency' => '', 'max_discount_minor' => '', 'valid_days' => '0',
            'min_order_minor' => '-1'] as $key => $value) {
            $original = config('demian-coupons.'.$key);
            config()->set('demian-coupons.'.$key, $value);
            try {
                $this->issue();
                $this->fail('Incomplete terms permitted: '.$key);
            } catch (RuntimeException $expected) {
                $this->assertNotEmpty($expected->getMessage());
            } finally {
                config()->set('demian-coupons.'.$key, $original);
            }
        }
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_issues_proposed_rank_tiers_only_from_sealed_winners_and_is_idempotent(): void
    {
        $this->sealed(4);
        $this->assertSame(['created' => 4, 'existing' => 0, 'winners' => 4],
            array_intersect_key($this->issue(), array_flip(['created', 'existing', 'winners'])));
        $this->assertSame(['created' => 0, 'existing' => 4, 'winners' => 4],
            array_intersect_key($this->issue(), array_flip(['created', 'existing', 'winners'])));
        $this->assertDatabaseCount('arcade_coupons', 4);
        $this->assertDatabaseCount('arcade_coupon_events', 4);
        $tiers = DB::table('arcade_coupons as c')->join('arcade_weekly_winners as w',
            'w.id', '=', 'c.winner_id')->orderBy('w.prize_rank')->pluck('discount_percent')->all();
        $this->assertSame([30, 20, 20, 10], array_map('intval', $tiers));
    }

    public function test_ciphertext_and_sha256_hash_are_distinct_from_displayed_secret(): void
    {
        $players = $this->sealed(1);
        $this->issue();
        $row = DB::table('arcade_coupons')->first();
        $response = $this->withToken($players[0]['token'])
            ->getJson('/api/v1/arcade/player/coupons')
            ->assertOk()->assertHeader('Cache-Control', 'no-store, private')->json('data.0');
        $this->assertMatchesRegularExpression('/^DMC-[A-F0-9]{32}$/D', $response['code']);
        $this->assertSame(hash('sha256', $response['code']), $row->code_hash);
        $this->assertSame($response['code'], Crypt::decryptString($row->code_ciphertext));
        $this->assertStringNotContainsString($response['code'], $row->code_ciphertext);
        $this->assertSame('issued', $response['status']);
    }

    public function test_another_player_cannot_list_or_use_anothers_wallet_endpoint(): void
    {
        $players = $this->sealed(2);
        $this->issue();
        $a = $this->withToken($players[0]['token'])
            ->getJson('/api/v1/arcade/player/coupons')->assertOk()->json('data.0.code');
        $b = $this->withToken($players[1]['token'])
            ->getJson('/api/v1/arcade/player/coupons')->assertOk()->json('data.0.code');
        $this->assertNotSame($a, $b);
        $this->getJson('/api/v1/arcade/player/coupons', ['Authorization' => 'Bearer wrong'])
            ->assertUnauthorized();
    }

    public function test_modified_snapshot_checksum_or_forged_winner_blocks_all_issuance(): void
    {
        $this->sealed(2);
        DB::table('arcade_weekly_results')->where('technical_rank', 1)->update(['score' => 99999]);
        try {
            $this->issue();
            $this->fail('Tampered snapshot minted coupon.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('checksum', $e->getMessage());
        }
        $this->assertDatabaseCount('arcade_coupons', 0);
        DB::table('arcade_weekly_results')->where('technical_rank', 1)->update(['score' => 990]);
        DB::table('arcade_weekly_winners')->where('prize_rank', 1)->update(['score' => 99999]);
        try {
            $this->issue();
            $this->fail('Forged prize minted coupon.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString('matching', $e->getMessage());
        }
        $this->assertDatabaseCount('arcade_coupons', 0);
    }

    public function test_does_not_issue_before_seal_or_if_sealed_count_differs(): void
    {
        $this->sealed(1);
        DB::table('arcade_weekly_periods')->update(['status' => 'open']);
        $this->expectException(RuntimeException::class);
        $this->issue();
    }

    public function test_account_deletion_revokes_unused_code_and_anonymizes_winner(): void
    {
        $players = $this->sealed(1);
        $this->issue();
        $this->withToken($players[0]['token'])->deleteJson('/api/v1/arcade/player')->assertOk();
        $this->assertDatabaseHas('arcade_coupons', ['status' => 'revoked', 'player_id' => null]);
        $this->assertDatabaseHas('arcade_weekly_winners', [
            'period_key' => 'weekly:tehran:2026-11-07', 'player_id' => null,
        ]);
        $this->assertDatabaseCount('arcade_coupons', 1);
        $this->assertDatabaseCount('arcade_coupon_events', 2);
    }

    public function test_manual_revocation_is_audited_and_needs_apply(): void
    {
        $this->sealed(1);
        $this->issue();
        // MySQL auto-increments are not reset by RefreshDatabase transactions.
        $id = (int) DB::table('arcade_coupons')->value('id');
        $this->artisan('arcade:revoke-coupon', [
            '--id' => (string) $id, '--reason' => 'fraud',
        ])->assertFailed();
        $this->assertDatabaseHas('arcade_coupons', ['id' => $id, 'status' => 'issued']);
        $this->artisan('arcade:revoke-coupon', [
            '--id' => (string) $id, '--reason' => 'fraud', '--apply' => true,
        ])->assertSuccessful();
        $this->artisan('arcade:revoke-coupon', [
            '--id' => (string) $id, '--reason' => 'fraud', '--apply' => true,
        ])->assertSuccessful();
        $this->assertDatabaseHas('arcade_coupons', ['id' => $id, 'status' => 'revoked']);
        $this->assertSame(1, DB::table('arcade_coupon_events')
            ->where('event_type', 'revoked')->count());
    }

    public function test_cli_will_not_issue_without_apply_and_never_prints_codes(): void
    {
        $this->sealed(1);
        $this->artisan('arcade:issue-coupons', [
            '--week' => 'weekly:tehran:2026-11-07',
        ])->assertFailed();
        $this->assertDatabaseCount('arcade_coupons', 0);
        $this->artisan('arcade:issue-coupons', [
            '--week' => 'weekly:tehran:2026-11-07', '--apply' => true, '--json' => true,
        ])->assertSuccessful();
        $this->assertDatabaseCount('arcade_coupons', 1);
    }
}
