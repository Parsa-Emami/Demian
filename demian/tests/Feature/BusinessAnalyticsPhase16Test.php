<?php

namespace Tests\Feature;

use App\Models\ArcadePlayer;
use App\Services\Arcade\BusinessAnalytics;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

final class BusinessAnalyticsPhase16Test extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-20 12:00:00','UTC'));
        config()->set('demian-coupons.cafe_enabled',true);
    }

    private function player(string $created): string
    {
        $player=ArcadePlayer::query()->create(['display_name'=>'Private Player','token_hash'=>hash('sha256',Str::random(64)),
            'token_expires_at'=>now()->addDay()]);
        $player->forceFill(['created_at'=>$created])->save();
        return $player->id;
    }

    private function run(string $player,string $time,string $status='verified'): void
    {
        DB::table('arcade_runs')->insert(['id'=>(string)Str::uuid(),'player_id'=>$player,
            'request_id'=>(string)Str::uuid(),'game_id'=>'dino-run','rules_version'=>'fixture',
            'character_slug'=>'darya','seed'=>1,'track_width'=>420,'score'=>100,'status'=>$status,
            'started_at'=>$time,'expires_at'=>CarbonImmutable::parse($time)->addHour(),
            'completed_at'=>CarbonImmutable::parse($time)->addMinute(),'replay_hash'=>str_repeat('a',64),
            'created_at'=>now(),'updated_at'=>now()]);
    }

    private function staff(string $role): void
    {
        $id=DB::table('arcade_cashier_staff')->insertGetId(['username'=>Str::random(16),'display_name'=>'Staff',
            'password_hash'=>Hash::make('fixture-secret'),'branch_id'=>'main','role'=>$role,'is_active'=>true,
            'session_version'=>1,'created_at'=>now(),'updated_at'=>now()]);
        $this->withSession(['cafe_staff_id'=>$id,'cafe_staff_version'=>1,'cafe_authenticated_at'=>now()->timestamp]);
    }

    public function test_aggregate_window_excludes_today_and_unverified_runs(): void
    {
        $a=$this->player('2026-11-13 21:00:00');
        $b=$this->player('2026-11-14 21:00:00');
        $old=$this->player('2026-10-01 21:00:00');
        $this->run($a,'2026-11-14 21:00:00');
        $this->run($a,'2026-11-15 21:00:00');
        $this->run($b,'2026-11-16 21:00:00','started');
        $this->run($old,'2026-11-18 21:00:00');
        $this->run($b,'2026-11-19 21:00:00');
        $r=app(BusinessAnalytics::class)->snapshot(7);
        self::assertSame('2026-11-13',$r['from']);
        self::assertSame('2026-11-20',$r['until_exclusive']);
        self::assertSame(2,$r['acquisition']['registrations']);
        self::assertSame(1,$r['acquisition']['new_players_with_verified_run']);
        self::assertSame(3,$r['engagement']['verified_runs']);
        self::assertSame(2,$r['engagement']['active_players']);
        self::assertSame(2,$r['wau']);
        self::assertSame(50.0,$r['acquisition']['registration_activation_percent']);
        self::assertSame(50.0,$r['retention']['rates']['d1']['percent']);
        self::assertNull($r['retention']['rates']['d30']['percent']);
        self::assertNull($r['coupon_cohort']['redemption_percent']);
        self::assertNull($r['referral_month_live']['cac_irr']);
        self::assertStringNotContainsString($a,json_encode($r));
        self::assertStringNotContainsString('Private Player',json_encode($r));
    }

    public function test_only_superadmin_can_export_and_view(): void
    {
        $this->get('/cashier/admin/analytics')->assertRedirect(route('cashier.login'));
        $this->staff('admin');
        $this->get('/cashier/admin/analytics?format=json')->assertForbidden();
        $this->staff('super_admin');
        $this->get('/cashier/admin/analytics?days=7')->assertOk()->assertSee('تحلیل کسب‌وکار');
        $this->get('/cashier/admin/analytics?days=7&format=json')->assertOk()
            ->assertHeader('Content-Disposition','attachment; filename="demian-business-analytics.json"')
            ->assertJsonPath('days',7)->assertJsonPath('acquisition.registrations',0)
            ->assertJsonPath('engagement.active_players',0);
        $this->getJson('/cashier/admin/analytics?days=999')->assertUnprocessable();
    }

    public function test_window_validation_rejects_unbounded_queries(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        app(BusinessAnalytics::class)->snapshot(365);
    }

    public function test_money_is_grouped_by_currency_and_only_cafe_receipts_count(): void
    {
        $a=$this->player('2026-11-12 10:00:00');
        foreach ([['IRR','in_cafe','2026-11-15 10:00:00',100000,10000],
            ['USD','in_cafe','2026-11-16 10:00:00',1000,100],
            ['IRR','shop','2026-11-17 10:00:00',50000,5000],
            ['IRR','in_cafe','2026-11-20 10:00:00',90000,9000]] as [$currency,$channel,$at,$gross,$discount]) {
            $coupon=DB::table('arcade_coupons')->insertGetId(['player_id'=>$a,
                'winner_id'=>null,'code_hash'=>hash('sha256',Str::random(64)),
                'code_ciphertext'=>'fixture','policy_version'=>'fixture','discount_percent'=>10,
                'currency'=>$currency,'min_order_minor'=>100,'max_discount_minor'=>10000,'status'=>'redeemed',
                'issued_at'=>'2026-11-14 10:00:00','expires_at'=>'2026-12-01 10:00:00','redeemed_at'=>$at,
                'created_at'=>now(),'updated_at'=>now()]);
            DB::table('arcade_coupon_redemptions')->insert(['coupon_id'=>$coupon,'reservation_id'=>null,
                'order_hash'=>hash('sha256',Str::random(64)),'currency'=>$currency,'channel'=>$channel,
                'subtotal_minor'=>$gross,'discount_minor'=>$discount,'redeemed_at'=>$at]);
        }
        $r=app(BusinessAnalytics::class)->snapshot(7);
        self::assertSame(4,$r['coupon_cohort']['issued']);
        self::assertSame(2,$r['coupon_cohort']['redeemed_in_cafe_before_cutoff']);
        self::assertSame(50.0,$r['coupon_cohort']['redemption_percent']);
        self::assertSame([
            ['currency'=>'IRR','receipts'=>1,'gross_minor'=>100000,'discount_minor'=>10000,'net_minor'=>90000],
            ['currency'=>'USD','receipts'=>1,'gross_minor'=>1000,'discount_minor'=>100,'net_minor'=>900],
        ],$r['cafe_receipts']);
    }

    public function test_trend_allocates_cross_boundary_completion_to_start_bucket(): void
    {
        $id=$this->player('2026-10-25 10:00:00');
        $this->run($id,'2026-10-27 20:29:59');
        $r=app(BusinessAnalytics::class)->snapshot(30);
        self::assertSame(1,$r['engagement']['verified_runs']);
        self::assertSame(1,array_sum(array_column($r['trend'],'verified_runs')));
    }
}
