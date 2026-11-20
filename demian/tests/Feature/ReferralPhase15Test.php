<?php

namespace Tests\Feature;

use App\Services\Arcade\PhoneIdentityService;
use App\Services\Arcade\ReferralService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Crypt;
use Tests\TestCase;

final class ReferralPhase15Test extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config()->set('demian-arcade.require_contact',false);
        config()->set('demian-referrals.enabled',true);
        config()->set('demian-identity.enabled',true);
        config()->set('demian-identity.key',str_repeat('i',64));
        config()->set('demian-identity.gateway_url','https://sms.example.test/send');
        config()->set('demian-identity.gateway_token',str_repeat('s',32));
    }

    private function player(string $name,array $extra=[]): array
    {
        return $this->postJson('/api/v1/arcade/players',['display_name'=>$name,...$extra])->assertCreated()->json();
    }

    private function verify(array $p,string $number): void
    {
        DB::table('arcade_verified_phones')->insert(['player_id'=>$p['player_id'],
            'phone_hash'=>app(PhoneIdentityService::class)->digest('phone-v1',$number),
            'phone_ciphertext'=>Crypt::encryptString($number),'verified_at'=>now()->utc()]);
    }

    public function test_private_code_and_attribution_and_disabled_gate(): void
    {
        $a=$this->player('Inviter');
        $this->postJson('/api/v1/arcade/player/referrals/code')->assertUnauthorized();
        $this->withToken($a['token'])->postJson('/api/v1/arcade/player/referrals/code')->assertForbidden();
        $this->verify($a,'+989121234567');
        $code=$this->postJson('/api/v1/arcade/player/referrals/code')->assertOk()->json('code');
        $this->assertMatchesRegularExpression('/^[A-F0-9]{16}$/D',$code);
        $this->postJson('/api/v1/arcade/player/referrals/code')->assertOk()->assertJsonPath('code',$code);
        $b=$this->player('Invitee',['referral_code'=>$code]);
        $this->assertDatabaseHas('arcade_referrals',['player_id'=>$b['player_id'],'inviter_id'=>$a['player_id'],'status'=>'pending']);
        $this->withToken($b['token'])->getJson('/api/v1/arcade/player/referrals')->assertOk()
            ->assertJsonPath('code',null)->assertJsonPath('attribution.status','pending')->assertJsonMissingPath('attribution.inviter_id');
        $this->withToken($a['token'])->getJson('/api/v1/arcade/player/referrals')->assertOk()
            ->assertJsonPath('invited',1)->assertJsonPath('qualified',0)->assertJsonPath('financial_rewards',false);
        $this->postJson('/api/v1/arcade/players',['display_name'=>'Invalid','referral_code'=>'0000000000000000'])->assertUnprocessable();
        $this->assertDatabaseCount('arcade_players',2);
        config()->set('demian-referrals.enabled',false);
        $this->postJson('/api/v1/arcade/player/referrals/code')->assertServiceUnavailable();
    }

    public function test_shared_device_and_exact_once_no_financial_reward(): void
    {
        $a=$this->player('Inviter');
        $this->verify($a,'+989121234567');
        $code=$this->withToken($a['token'])->postJson('/api/v1/arcade/player/referrals/code')->assertOk()->json('code');
        $b=$this->player('Invitee',['referral_code'=>$code]);
        $this->verify($b,'+989121234568');
        foreach ([$a,$b] as $p) DB::table('arcade_identity_devices')->insert([
            'player_id'=>$p['player_id'],'digest'=>str_repeat('d',64),'last_seen'=>now()->utc()]);
        $this->travel(3)->days();
        $id=(int)DB::table('arcade_referrals')->value('id');
        $service=app(ReferralService::class);
        $service->evaluate($id); $service->evaluate($id);
        $this->assertDatabaseHas('arcade_referrals',['id'=>$id,'status'=>'review','points'=>0]);
        $this->assertDatabaseCount('arcade_referral_awards',0);
    }
}
