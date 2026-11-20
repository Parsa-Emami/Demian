<?php

namespace Tests\Feature;

use App\Services\Arcade\CafeTableService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

final class CafeTablePhase17Test extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('demian-coupons.cafe_enabled',true);
        config()->set('demian-tables.enabled',true);
        config()->set('demian-tables.public_base','https://cafe.example.test');
        config()->set('demian-tables.game_url','https://game.example.test/play/');
        config()->set('demian-arcade.api_only',true);
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-11-20 21:00:00','UTC'));
    }

    private function staff(string $role): int
    {
        $id=DB::table('arcade_cashier_staff')->insertGetId(['username'=>Str::random(16),'display_name'=>'Staff',
            'password_hash'=>Hash::make('fixture-password'),'branch_id'=>'main','role'=>$role,'is_active'=>true,
            'session_version'=>1,'created_at'=>now(),'updated_at'=>now()]);
        $this->withSession(['cafe_staff_id'=>$id,'cafe_staff_version'=>1,'cafe_authenticated_at'=>now()->timestamp]);
        return $id;
    }

    private function credentials(): array
    {
        return ['password'=>'fixture-password','confirmed'=>1];
    }

    public function test_management_and_print_and_rotation(): void
    {
        $this->get('/cashier/admin/tables')->assertRedirect(route('cashier.login'));
        $this->staff('admin');
        $this->get('/cashier/admin/tables')->assertForbidden();
        $this->staff('super_admin');
        $this->post('/cashier/admin/tables',['branch'=>'main','label'=>'1','password'=>'wrong','confirmed'=>1])->assertForbidden();
        $this->post('/cashier/admin/tables',['branch'=>'main','label'=>'1',...$this->credentials()])->assertRedirect(route('cashier.tables'));
        $t=DB::table('arcade_cafe_tables')->first();
        $this->assertMatchesRegularExpression('/^[a-f0-9]{32}$/D',$t->code);
        $this->get('/cashier/admin/tables/'.$t->id.'/print')->assertOk()->assertSee('https://cafe.example.test/t/'.$t->code);
        $this->get('/t/'.$t->code)->assertOk()->assertSee('ورود به بازی');
        $this->assertDatabaseCount('arcade_table_daily_launches',0);
        $this->post('/cashier/admin/tables/'.$t->id.'/rotate',$this->credentials())->assertRedirect();
        $new=DB::table('arcade_cafe_tables')->first();
        $this->assertNotSame($new->code,$t->code);
        $this->get('/t/'.$t->code)->assertNotFound();
        $this->post('/cashier/admin/tables/'.$t->id.'/disable',$this->credentials())->assertStatus(429);
        $this->travel(61)->seconds();
        $this->post('/cashier/admin/tables/'.$t->id.'/disable',$this->credentials())->assertRedirect();
        $this->get('/t/'.$new->code)->assertNotFound();
        $this->assertDatabaseCount('arcade_cashier_admin_events',3);
    }

    public function test_public_explicit_launch_is_deduplicated_without_player_or_reward(): void
    {
        $id=$this->staff('super_admin');
        $service=app(CafeTableService::class);
        $service->create($id,1,'main','2');
        $t=DB::table('arcade_cafe_tables')->first();
        $this->get('/t/'.$t->code)->assertOk();
        $claim=session('table_launch');
        $this->post('/t/'.$t->code,['nonce'=>$claim['nonce']])->assertStatus(303)
            ->assertRedirect('https://game.example.test/play/');
        $this->withSession(['table_launch'=>$claim])->post('/t/'.$t->code,['nonce'=>$claim['nonce']])->assertStatus(303);
        $this->assertDatabaseHas('arcade_table_daily_launches',['table_id'=>$t->id,'day'=>'2026-11-21','launches'=>1]);
        $this->assertDatabaseCount('arcade_players',0);
        $this->assertDatabaseCount('arcade_coupons',0);
        $this->assertDatabaseCount('arcade_table_launch_nonces',1);
        $this->travel(2)->days();
        $service->prune();
        $this->assertDatabaseCount('arcade_table_launch_nonces',0);
        config()->set('demian-tables.enabled',false);
        $this->get('/t/'.$t->code)->assertServiceUnavailable();
    }

    public function test_untrusted_destination_and_nonce_fail_closed(): void
    {
        $actor=$this->staff('super_admin');
        $service=app(CafeTableService::class);
        $service->create($actor,1,'main','3');
        $t=DB::table('arcade_cafe_tables')->first();
        $this->post('/t/'.$t->code,['nonce'=>str_repeat('a',64)])->assertStatus(419);
        config()->set('demian-tables.game_url','https://game.example.test/?next=https://evil.test');
        $this->get('/t/'.$t->code)->assertServiceUnavailable();
        $this->assertDatabaseCount('arcade_table_daily_launches',0);
    }

    public function test_daily_cap_limits_counter_and_nonce_storage_and_preserves_retirement_history(): void
    {
        $actor=$this->staff('super_admin');
        $service=app(CafeTableService::class);
        $service->create($actor,1,'main','4');
        $t=DB::table('arcade_cafe_tables')->first();
        DB::table('arcade_table_daily_launches')->insert(['table_id'=>$t->id,'day'=>'2026-11-21','launches'=>CafeTableService::DAILY_CAP-1]);
        $service->launch($t->code,str_repeat('b',64));
        $service->launch($t->code,str_repeat('c',64));
        $this->assertDatabaseCount('arcade_table_launch_nonces',1);
        $service->change($actor,1,$t->id,'disable');
        self::assertSame(CafeTableService::DAILY_CAP,$service->report()[0]['launches_30d']);
        self::assertFalse($service->report()[0]['active']);
        $this->assertDatabaseHas('arcade_table_daily_launches',['table_id'=>$t->id,'day'=>'2026-11-21','launches'=>CafeTableService::DAILY_CAP]);
    }
}
