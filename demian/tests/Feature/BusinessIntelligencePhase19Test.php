<?php

namespace Tests\Feature;

use App\Models\ArcadePlayer;
use App\Services\Arcade\BusinessAnalytics;
use App\Services\Arcade\CafeTableService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

final class BusinessIntelligencePhase19Test extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(CarbonImmutable::parse('2026-11-20 12:00:00','UTC'));
        config()->set('demian-coupons.cafe_enabled',true);
    }

    private function staff(string $role='super_admin'): int
    {
        $id=DB::table('arcade_cashier_staff')->insertGetId(['username'=>'staff'.Str::random(10),
            'display_name'=>'Private Operator','password_hash'=>Hash::make('fixture-secret'),'branch_id'=>'main',
            'role'=>$role,'is_active'=>true,'session_version'=>1,'created_at'=>now(),'updated_at'=>now()]);
        $this->withSession(['cafe_staff_id'=>$id,'cafe_staff_version'=>1,'cafe_authenticated_at'=>now()->timestamp]);
        return $id;
    }

    private function player(): string
    {
        $p=ArcadePlayer::query()->create(['display_name'=>'Private Customer','token_hash'=>hash('sha256',Str::random(64)),
            'token_expires_at'=>now()->addDay()]);
        return $p->id;
    }

    private function coupon(?string $player,string $source,string $currency,string $issued,string $status='issued'): int
    {
        return DB::table('arcade_coupons')->insertGetId(['player_id'=>$player,'winner_id'=>null,
            'source'=>$source,'code_hash'=>hash('sha256',Str::random(64)),'code_ciphertext'=>'private-code-fixture',
            'policy_version'=>'fixture','discount_percent'=>10,'currency'=>$currency,'min_order_minor'=>100,
            'max_discount_minor'=>1000,'status'=>$status,'issued_at'=>$issued,'expires_at'=>'2026-11-30 10:00:00',
            'created_at'=>now(),'updated_at'=>now()]);
    }

    private function receipt(int $coupon,string $branch,string $currency,string $at,int $gross,int $discount,string $channel='in_cafe'): void
    {
        DB::table('arcade_coupon_redemptions')->insert(['coupon_id'=>$coupon,'reservation_id'=>null,
            'order_hash'=>hash('sha256',Str::random(64)),'currency'=>$currency,'channel'=>$channel,'branch_id'=>$branch,
            'subtotal_minor'=>$gross,'discount_minor'=>$discount,'redeemed_at'=>$at]);
        DB::table('arcade_coupons')->where('id',$coupon)->update(['status'=>'redeemed','redeemed_at'=>$at]);
    }

    public function test_reconciles_money_sources_dates_currency_and_returning_owners(): void
    {
        $p=$this->player();$q=$this->player();
        foreach ([
            [$p,'weekly','IRR','2026-11-10 10:00:00','2026-11-14 10:00:00','main',10000,1000,'in_cafe'],
            [$p,'gift','IRR','2026-11-14 10:00:00','2026-11-15 10:00:00','main',20000,1000,'in_cafe'],
            [$q,'weekly','USD','2026-11-14 10:00:00','2026-11-16 10:00:00','second',1000,100,'in_cafe'],
            [null,'gift','IRR','2026-11-14 10:00:00','2026-11-17 10:00:00','main',5000,500,'in_cafe'],
            [$q,'gift','IRR','2026-11-10 10:00:00','2026-11-10 10:00:00','main',10000,1000,'in_cafe'],
            [$q,'gift','IRR','2026-11-14 10:00:00','2026-11-18 10:00:00','main',9000,900,'shop'],
            [$q,'gift','IRR','2026-11-14 10:00:00','2026-11-19 20:30:00','main',10000,1000,'in_cafe'],
        ] as [$owner,$source,$currency,$issued,$at,$branch,$gross,$discount,$channel]){
            $id=$this->coupon($owner,$source,$currency,$issued);
            $this->receipt($id,$branch,$currency,$at,$gross,$discount,$channel);
        }
        $this->coupon($q,'weekly','IRR','2026-11-18 10:00:00');
        $this->coupon($q,'gift','IRR','2026-11-18 10:00:00','revoked');
        $r=app(BusinessAnalytics::class)->snapshot(7);$bi=$r['commercial'];
        self::assertSame(2,$r['schema']);
        self::assertSame(4,array_sum(array_column($bi['receipts_by_branch'],'receipts')));
        self::assertSame(4,array_sum(array_column($bi['receipts_by_source'],'receipts')));
        $currencies=array_column($bi['comparison']['receipts_by_currency'],null,'currency');
        self::assertSame(32500,$currencies['IRR']['net_minor']['current']);
        self::assertSame(9000,$currencies['IRR']['net_minor']['previous']);
        self::assertSame(900,$currencies['USD']['net_minor']['current']);
        self::assertNull($currencies['USD']['net_minor']['change_percent']);
        self::assertSame(2,$bi['return_purchases']['known_coupon_owner_accounts']);
        self::assertSame(1,$bi['return_purchases']['repeat_coupon_owner_accounts']);
        self::assertSame(50.0,$bi['return_purchases']['repeat_percent']);
        self::assertSame(1,$bi['return_purchases']['receipts_with_erased_owner']);
        self::assertSame(3,array_sum(array_column($bi['coupon_sources'],'redeemed')));
        self::assertSame(1,$bi['live_liability']['rows'][0]['outstanding']);
        self::assertSame(1000,$bi['live_liability']['rows'][0]['maximum_minor']);
        self::assertSame(4,array_sum(array_map(fn($bucket)=>array_sum(array_column($bucket['receipts'],'receipts')),$bi['commercial_trend'])));
        self::assertStringNotContainsString($p,json_encode($r));
        self::assertStringNotContainsString('private-code-fixture',json_encode($r));
    }

    public function test_qr_saturation_and_quiet_offer_cohort_do_not_inflate_capacity(): void
    {
        $staff=$this->staff();
        $table=DB::table('arcade_cafe_tables')->insertGetId(['branch_id'=>'main','label'=>'A1','code'=>str_repeat('a',32),
            'active'=>false,'created_at'=>now(),'updated_at'=>now()]);
        foreach(['2026-11-12'=>5,'2026-11-13'=>100,'2026-11-19'=>CafeTableService::DAILY_CAP,'2026-11-20'=>500] as $day=>$n)
            DB::table('arcade_table_daily_launches')->insert(['table_id'=>$table,'day'=>$day,'launches'=>$n]);
        $offer=DB::table('arcade_quiet_offers')->insertGetId(['branch_id'=>'main','local_day'=>'2026-11-15',
            'starts_at'=>'2026-11-15 10:00:00','ends_at'=>'2026-11-15 14:00:00','observed_at'=>'2026-11-15 09:55:00',
            'occupied_seats'=>10,'total_seats'=>40,'percent'=>10,'currency'=>'IRR','policy_version'=>'fixture',
            'min_order_minor'=>100,'max_discount_minor'=>1000,'capacity'=>5,'cost_ceiling_bps'=>6000,'margin_floor_bps'=>1500,
            'paused'=>true,'created_by'=>$staff,'created_at'=>now(),'updated_at'=>now()]);
        foreach(range(1,2) as $i) {
            $p=$this->player();$coupon=$this->coupon($p,'quiet_hours','IRR','2026-11-15 10:00:00');
            DB::table('arcade_quiet_claims')->insert(['offer_id'=>$offer,'coupon_id'=>$coupon,'player_id'=>$p,
                'local_day'=>'2026-11-15','identity_digest'=>str_repeat((string)$i,64),'created_at'=>'2026-11-15 10:00:00']);
            if($i===1)$this->receipt($coupon,'main','IRR','2026-11-15 11:00:00',10000,1000);
        }
        $bi=app(BusinessAnalytics::class)->snapshot(7)['commercial'];
        self::assertSame(2100,$bi['qr']['launches']);
        self::assertSame(1,$bi['qr']['saturated_table_days']);
        self::assertSame('lower_bound',$bi['qr']['status']);
        self::assertFalse($bi['comparison']['qr_comparison_exact']);
        self::assertNull($bi['comparison']['qr']['change_percent']);
        self::assertSame(1,$bi['quiet_hours'][0]['offers']);
        self::assertSame(5,$bi['quiet_hours'][0]['capacity']);
        self::assertSame(5000,$bi['quiet_hours'][0]['reserved_minor']);
        self::assertSame(2,$bi['quiet_hours'][0]['claimed']);
        self::assertSame(1,$bi['quiet_hours'][0]['redeemed']);
        self::assertSame(50.0,$bi['quiet_hours'][0]['redemption_percent']);
        self::assertSame(9000,$bi['quiet_hours'][0]['net_minor']);
        self::assertStringNotContainsString(str_repeat('a',32),json_encode($bi));
    }

    public function test_exports_require_global_permission_and_keep_empty_data_distinct(): void
    {
        $url='/cashier/admin/analytics?days=7&format=csv';
        $this->get($url)->assertRedirect(route('cashier.login'));
        $this->staff('admin');
        $this->get($url)->assertForbidden();
        $this->staff();
        $response=$this->get($url)->assertOk()
            ->assertHeader('Content-Disposition','attachment; filename=demian-business-analytics.csv');
        $body=$response->streamedContent();
        self::assertStringContainsString('commercial.return_purchases.repeat_percent,,null',$body);
        self::assertStringContainsString('commercial.return_purchases.known_coupon_owner_accounts,0,integer',$body);
        self::assertStringContainsString('commercial.campaigns_lifetime_live.rows,,empty_array',$body);
        self::assertStringNotContainsString('Private Operator',$body);
        $this->get('/cashier/admin/analytics?days=7')->assertOk()->assertSee('عملکرد QR میزها')
            ->assertSee('اقتصاد کمپین‌های هفتگی');
    }
}
