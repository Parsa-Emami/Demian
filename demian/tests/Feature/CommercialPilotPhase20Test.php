<?php

namespace Tests\Feature;

use App\Services\Arcade\CommercialPilot;
use App\Services\Arcade\PilotPreflight;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

final class CommercialPilotPhase20Test extends TestCase
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
            'display_name'=>'Operator','password_hash'=>Hash::make('fixture-secret'),'branch_id'=>'main',
            'role'=>$role,'is_active'=>true,'session_version'=>1,'created_at'=>now(),'updated_at'=>now()]);
        $this->withSession(['cafe_staff_id'=>$id,'cafe_staff_version'=>1,'cafe_authenticated_at'=>now()->timestamp]);
        return $id;
    }

    private function plan(array $overrides=[]): array
    {
        return array_replace(['branch_id'=>'main','mode'=>'rehearsal','pilot_start'=>'2026-11-21','days'=>7,
            'currency'=>'IRR','discount_budget_minor'=>10000,'minimum_receipts'=>20,'target_uplift_bps'=>500,
            'evidence_ref'=>'PLAN-001'],$overrides);
    }

    private function day(string $date,array $overrides=[]): array
    {
        return array_replace(['day'=>$date,'receipts'=>10,'net_sales_minor'=>10000,'variable_cost_minor'=>4000,
            'operating_cost_minor'=>1000,'incidents'=>0,'evidence_ref'=>'POS-'.$date],$overrides);
    }

    private function expectStatus(int $code,callable $fn): void
    {
        try{$fn();self::fail('Expected HTTP '.$code);}
        catch(HttpException $e){self::assertSame($code,$e->getStatusCode());}
    }

    private function baseline(CommercialPilot $service,int $actor,int $id): void
    {
        $this->travelTo(CarbonImmutable::parse('2026-11-21 00:00:00','Asia/Tehran'));
        for($i=14;$i<=20;$i++)$service->record($actor,1,$id,$this->day('2026-11-'.$i));
    }

    public function test_access_planning_and_production_gate(): void
    {
        $this->get('/cashier/admin/pilot')->assertRedirect(route('cashier.login'));
        $this->staff('admin');
        $this->get('/cashier/admin/pilot')->assertForbidden();
        $actor=$this->staff();
        $this->get('/cashier/admin/pilot')->assertOk()->assertSee('پایلوت تجاری');
        $this->post('/cashier/admin/pilot',[...$this->plan(),'password'=>'wrong','confirmed'=>1])->assertForbidden();
        $this->post('/cashier/admin/pilot',[...$this->plan(['mode'=>'live']),'password'=>'fixture-secret','confirmed'=>1])->assertRedirect();
        $id=(int)DB::table('arcade_commercial_pilots')->value('id');$service=app(CommercialPilot::class);
        $this->expectStatus(409,fn()=>$service->create($actor,1,$this->plan()));
        $this->baseline($service,$actor,$id);
        config()->set('demian-pilot.live_enabled',true);
        config()->set('demian-pilot.release_sha',str_repeat('a',40));
        config()->set('demian-pilot.art_manifest_sha256',str_repeat('b',64));
        self::assertFalse(app(PilotPreflight::class)->inspect()['passed']);
        $this->expectStatus(409,fn()=>$service->start($actor,1,$id,'START-001'));
        $this->assertDatabaseHas('arcade_commercial_pilots',['id'=>$id,'status'=>'draft','release_sha'=>null]);
        $this->assertDatabaseCount('arcade_coupons',0);
    }

    public function test_rehearsal_complete_cycle_immutable_records_and_bounded_decisions(): void
    {
        $actor=$this->staff();$service=app(CommercialPilot::class);
        $id=$service->create($actor,1,$this->plan());
        $this->expectStatus(422,fn()=>$service->record($actor,1,$id,$this->day('2026-11-20')));
        $this->expectStatus(409,fn()=>$service->start($actor,1,$id,'START-001'));
        $this->baseline($service,$actor,$id);
        $this->expectStatus(409,fn()=>$service->record($actor,1,$id,$this->day('2026-11-20')));
        $service->start($actor,1,$id,'START-001');
        $this->expectStatus(409,fn()=>$service->transition($actor,1,$id,'review_scale','EARLY-001'));
        $this->travelTo(CarbonImmutable::parse('2026-11-28 00:00:00','Asia/Tehran'));
        for($i=21;$i<=27;$i++)$service->record($actor,1,$id,$this->day('2026-11-'.$i,['net_sales_minor'=>11000]));
        $report=$service->detail($id)['report'];
        self::assertTrue($report['complete']);self::assertTrue($report['ledger_consistent']);
        self::assertSame(35000,$report['baseline']['contribution_minor']);
        self::assertSame(42000,$report['pilot']['contribution_minor']);
        self::assertSame(20.0,$report['contribution_change_percent']);
        self::assertSame('review_scale',$report['recommendation']);self::assertNull($report['causal_roi']);
        $this->expectStatus(409,fn()=>$service->transition($actor,1,$id,'iterate','WRONG-001'));
        $service->transition($actor,1,$id,'review_scale','REVIEW-001');
        $service->action($actor,1,$id,['category'=>'ux','success_metric'=>'retention','due_day'=>'2026-11-30','evidence_ref'=>'TASK-001']);
        $action=(int)DB::table('arcade_pilot_actions')->value('id');
        $service->resolve($actor,1,$id,$action,'DONE-001');
        $this->expectStatus(409,fn()=>$service->resolve($actor,1,$id,$action,'DONE-002'));
        $this->assertDatabaseHas('arcade_commercial_pilots',['id'=>$id,'status'=>'closed','decision'=>'review_scale','mode'=>'rehearsal']);
        $this->assertDatabaseHas('arcade_pilot_actions',['id'=>$action,'status'=>'done']);
        $decision=json_decode(DB::table('arcade_pilot_events')->where('pilot_id',$id)->where('event_type','decision')->value('details'),true,512,JSON_THROW_ON_ERROR);
        self::assertSame('rehearsal',$decision['mode']);
        self::assertSame(42000,$decision['report']['pilot']['contribution_minor']);
        $this->assertDatabaseCount('arcade_pilot_daily',14);
        $this->assertDatabaseCount('arcade_coupons',0);
        $this->withSession(['cafe_authenticated_at'=>now()->timestamp])->get('/cashier/admin/pilot?id='.$id)->assertOk()->assertSee('review_scale');
    }

    public function test_incident_requires_stop_and_missing_evidence_is_inconclusive(): void
    {
        $actor=$this->staff();$service=app(CommercialPilot::class);$id=$service->create($actor,1,$this->plan());
        self::assertSame('inconclusive',$service->detail($id)['report']['recommendation']);
        $this->baseline($service,$actor,$id);$service->start($actor,1,$id,'START-001');
        $this->travelTo(CarbonImmutable::parse('2026-11-22 00:00:00','Asia/Tehran'));
        $service->record($actor,1,$id,$this->day('2026-11-21',['incidents'=>1]));
        self::assertSame('stop',$service->detail($id)['report']['recommendation']);
        $service->transition($actor,1,$id,'stop','INCIDENT-001');
        $this->assertDatabaseHas('arcade_commercial_pilots',['id'=>$id,'status'=>'stopped','decision'=>'stop']);
        $this->expectStatus(409,fn()=>$service->record($actor,1,$id,$this->day('2026-11-21')));
    }

    public function test_real_coupon_ledger_minimum_and_budget_warning(): void
    {
        $actor=$this->staff();$service=app(CommercialPilot::class);$id=$service->create($actor,1,$this->plan(['discount_budget_minor'=>100]));
        $this->baseline($service,$actor,$id);$service->start($actor,1,$id,'START-001');
        $player=\App\Models\ArcadePlayer::query()->create(['display_name'=>'Fixture','token_hash'=>hash('sha256',Str::random(64)),
            'token_expires_at'=>now()->addDay()]);
        $coupon=DB::table('arcade_coupons')->insertGetId(['player_id'=>$player->id,'winner_id'=>null,'source'=>'weekly',
            'code_hash'=>hash('sha256',Str::random(64)),'code_ciphertext'=>'test','policy_version'=>'fixture','discount_percent'=>10,
            'currency'=>'IRR','min_order_minor'=>100,'max_discount_minor'=>1000,'status'=>'redeemed',
            'issued_at'=>'2026-11-21 08:00:00','expires_at'=>'2026-11-30 08:00:00','redeemed_at'=>'2026-11-21 10:00:00',
            'created_at'=>now(),'updated_at'=>now()]);
        DB::table('arcade_coupon_redemptions')->insert(['coupon_id'=>$coupon,'reservation_id'=>null,'order_hash'=>hash('sha256',Str::random(64)),
            'currency'=>'IRR','channel'=>'in_cafe','branch_id'=>'main','subtotal_minor'=>2000,'discount_minor'=>200,
            'redeemed_at'=>'2026-11-21 10:00:00']);
        $this->travelTo(CarbonImmutable::parse('2026-11-22 00:00:00','Asia/Tehran'));
        $this->expectStatus(422,fn()=>$service->record($actor,1,$id,$this->day('2026-11-21',['net_sales_minor'=>1799])));
        $service->record($actor,1,$id,$this->day('2026-11-21'));
        $r=$service->detail($id)['report'];
        self::assertSame(1800,$r['pilot']['coupon_net_minor']);
        self::assertSame(200,$r['recorded_pilot_discount_minor']);
        self::assertTrue($r['discount_budget_exceeded']);
        self::assertSame('stop',$r['recommendation']);
        DB::table('arcade_coupon_redemptions')->where('coupon_id',$coupon)->update(['subtotal_minor'=>3000]);
        self::assertFalse($service->detail($id)['report']['ledger_consistent']);
    }
}
